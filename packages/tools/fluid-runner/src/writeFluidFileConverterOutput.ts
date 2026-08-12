/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { IFluidFileConverterDirectoryOutput } from "./codeLoaderBundle.js";

type FluidFileConverterOutput =
	| string
	| Uint8Array
	| IFluidFileConverterDirectoryOutput;

interface IPlannedPath {
	readonly path: string;
	readonly key: string;
}

interface IPlannedFile extends IPlannedPath {
	readonly content: string | Uint8Array;
}

interface IPlannedDirectoryOutput {
	readonly directories: readonly string[];
	readonly files: readonly IPlannedFile[];
}

const invalidDirectoryOutputMessage = "Invalid Fluid file converter directory output";
const directoryOutputWriteFailureMessage =
	"Failed to materialize Fluid file converter directory output";
const directoryOutputCleanupFailureMessage =
	"Failed to materialize and clean up Fluid file converter directory output";

const invalidWindowsPathCharacter = /[<>:"|?*]/u;
const reservedWindowsPathName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

function throwInvalidDirectoryOutput(): never {
	throw new TypeError(invalidDirectoryOutputMessage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isReadonlyArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}

function getPathKey(resolvedPath: string): string {
	return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
}

function isInvalidPathSegment(segment: string): boolean {
	return (
		segment.length === 0 ||
		segment === "." ||
		segment === ".." ||
		invalidWindowsPathCharacter.test(segment) ||
		segment.endsWith(".") ||
		segment.endsWith(" ") ||
		reservedWindowsPathName.test(segment)
	);
}

function planPath(relativePath: unknown, outputRoot: string): IPlannedPath {
	if (
		typeof relativePath !== "string" ||
		relativePath.includes("\0") ||
		relativePath.includes("\\") ||
		path.posix.isAbsolute(relativePath) ||
		path.win32.isAbsolute(relativePath) ||
		/^[A-Za-z]:/u.test(relativePath)
	) {
		throwInvalidDirectoryOutput();
	}

	const segments = relativePath.split("/");
	if (segments.some(isInvalidPathSegment)) {
		throwInvalidDirectoryOutput();
	}

	const resolvedPath = path.resolve(outputRoot, ...segments);
	const resolvedRelativePath = path.relative(outputRoot, resolvedPath);
	if (
		resolvedRelativePath.length === 0 ||
		resolvedRelativePath === ".." ||
		resolvedRelativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(resolvedRelativePath)
	) {
		throwInvalidDirectoryOutput();
	}

	return {
		path: resolvedPath,
		key: getPathKey(resolvedPath),
	};
}

function addParentDirectories(
	resolvedPath: string,
	outputRoot: string,
	directories: Map<string, string>,
): void {
	let parent = path.dirname(resolvedPath);
	while (parent !== outputRoot) {
		directories.set(getPathKey(parent), parent);
		const nextParent = path.dirname(parent);
		if (nextParent === parent) {
			throwInvalidDirectoryOutput();
		}
		parent = nextParent;
	}
}

function planDirectoryOutput(
	output: unknown,
	outputRoot: string,
): IPlannedDirectoryOutput {
	if (!isRecord(output)) {
		throwInvalidDirectoryOutput();
	}

	const directoryValues = output.directories ?? [];
	const fileValues = output.files;
	if (!isReadonlyArray(directoryValues) || !isReadonlyArray(fileValues)) {
		throwInvalidDirectoryOutput();
	}

	const explicitDirectoryKeys = new Set<string>();
	const directories = new Map<string, string>();
	for (const directoryValue of directoryValues) {
		const plannedDirectory = planPath(directoryValue, outputRoot);
		if (explicitDirectoryKeys.has(plannedDirectory.key)) {
			throwInvalidDirectoryOutput();
		}
		explicitDirectoryKeys.add(plannedDirectory.key);
		directories.set(plannedDirectory.key, plannedDirectory.path);
		addParentDirectories(plannedDirectory.path, outputRoot, directories);
	}

	const fileKeys = new Set<string>();
	const files: IPlannedFile[] = [];
	for (const fileValue of fileValues) {
		if (!isRecord(fileValue)) {
			throwInvalidDirectoryOutput();
		}

		const content = fileValue.content;
		if (typeof content !== "string" && !(content instanceof Uint8Array)) {
			throwInvalidDirectoryOutput();
		}

		const plannedFile = planPath(fileValue.path, outputRoot);
		if (fileKeys.has(plannedFile.key)) {
			throwInvalidDirectoryOutput();
		}
		fileKeys.add(plannedFile.key);
		files.push({ ...plannedFile, content });
		addParentDirectories(plannedFile.path, outputRoot, directories);
	}

	for (const fileKey of fileKeys) {
		if (directories.has(fileKey)) {
			throwInvalidDirectoryOutput();
		}
	}

	return {
		directories: [...directories.values()].sort(
			(left, right) =>
				left.split(path.sep).length - right.split(path.sep).length ||
				left.localeCompare(right),
		),
		files,
	};
}

function materializeDirectoryOutput(
	outputPath: string,
	output: IFluidFileConverterDirectoryOutput,
): void {
	const outputRoot = path.resolve(outputPath);
	const plan = planDirectoryOutput(output, outputRoot);

	// This is intentionally non-recursive so the requested output root is created exclusively.
	fs.mkdirSync(outputRoot);
	try {
		for (const directory of plan.directories) {
			fs.mkdirSync(directory);
		}
		for (const file of plan.files) {
			fs.writeFileSync(file.path, file.content, { flag: "wx" });
		}
	} catch {
		try {
			fs.rmSync(outputRoot, { recursive: true, force: true });
		} catch {
			throw new Error(directoryOutputCleanupFailureMessage);
		}
		throw new Error(directoryOutputWriteFailureMessage);
	}
}

/**
 * Writes converter output to an exclusive file or directory path.
 * @internal
 */
export function writeFluidFileConverterOutput(
	outputPath: string,
	output: FluidFileConverterOutput,
): void {
	if (typeof output === "string" || output instanceof Uint8Array) {
		fs.writeFileSync(outputPath, output, { flag: "wx" });
		return;
	}

	materializeDirectoryOutput(outputPath, output);
}
