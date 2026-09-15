#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rustServiceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const groupingRoots = [
	"crates",
	"crates/wrappers",
	"crates/spikes",
	"examples",
	"tests",
	"benchmarks",
	"scripts",
];
const requestedRoots = process.argv.slice(2);
const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;
const failures = [];
const checkedReadmePaths = new Set();
let checkedLinks = 0;
let checkedReadmes = 0;

function resolveWithinRustService(candidate) {
	const resolved = path.resolve(rustServiceRoot, candidate);
	const relative = path.relative(rustServiceRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`path escapes rust-service: ${candidate}`);
	}
	return resolved;
}

function readmesUnder(directory) {
	const readmes = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			readmes.push(...readmesUnder(entryPath));
		} else if (entry.isFile() && entry.name.toLowerCase() === "readme.md") {
			readmes.push(entryPath);
		}
	}
	return readmes;
}

function cargoPackageRoots(directory) {
	const roots = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === "target") {
			continue;
		}
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			roots.push(...cargoPackageRoots(entryPath));
		} else if (
			entry.isFile() &&
			entry.name === "Cargo.toml" &&
			directory !== rustServiceRoot
		) {
			roots.push(path.relative(rustServiceRoot, directory));
		}
	}
	return roots;
}

function childDirectoryRoots(directory) {
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => path.relative(rustServiceRoot, path.join(directory, entry.name)));
}

function checkLinks(readme) {
	if (checkedReadmePaths.has(readme)) {
		return;
	}
	checkedReadmePaths.add(readme);
	checkedReadmes += 1;
	const contents = fs.readFileSync(readme, "utf8");
	for (const match of contents.matchAll(markdownLink)) {
		const destination = match[1].trim();
		if (
			destination === "" ||
			destination.startsWith("#") ||
			/^[a-z][a-z0-9+.-]*:/i.test(destination)
		) {
			continue;
		}
		const withoutTitle = destination.replace(/\s+["'][^"']*["']$/, "");
		const decodedPath = decodeURIComponent(withoutTitle.split("#", 1)[0]);
		const target = path.resolve(path.dirname(readme), decodedPath);
		const relativeTarget = path.relative(rustServiceRoot, target);
		checkedLinks += 1;
		if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
			failures.push(
				`${path.relative(rustServiceRoot, readme)}: link escapes rust-service: ${destination}`,
			);
		} else if (!fs.existsSync(target)) {
			failures.push(
				`${path.relative(rustServiceRoot, readme)}: missing link target: ${destination}`,
			);
		}
	}
}

function checkRoot(root) {
	const absoluteRoot = resolveWithinRustService(root);
	const readme = path.join(absoluteRoot, "README.md");
	if (!fs.statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) {
		failures.push(`${root}: root is not a directory`);
		return;
	}
	if (!fs.statSync(readme, { throwIfNoEntry: false })?.isFile()) {
		failures.push(`${root}: README.md is missing`);
		return;
	}

	for (const nestedReadme of readmesUnder(absoluteRoot)) {
		checkLinks(nestedReadme);
	}
}

const roots =
	requestedRoots.length === 0
		? [
				...new Set([
					...groupingRoots,
					...cargoPackageRoots(path.join(rustServiceRoot, "crates")),
					...cargoPackageRoots(path.join(rustServiceRoot, "examples")),
					...childDirectoryRoots(path.join(rustServiceRoot, "tests")),
				]),
			].sort()
		: requestedRoots;

for (const root of roots) {
	try {
		checkRoot(root);
	} catch (error) {
		failures.push(`${root}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`documentation check failed: ${failure}`);
	}
	process.exitCode = 1;
} else {
	console.log(
		`documentation check passed: ${roots.length} roots, ${checkedReadmes} READMEs, ${checkedLinks} local links`,
	);
}
