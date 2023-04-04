/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { IFluidFileConverter } from "./codeLoaderBundle";

/**
 * Is the given snapshot in JSON format
 * @param content - snapshot file content
 * @internal
 */
export function isJsonSnapshot(content: Buffer): boolean {
	return content.toString(undefined, 0, 1) === "{";
}

/**
 * Get the ODSP snapshot file content
 * Works on both JSON and binary snapshot formats
 * @param filePath - path to the ODSP snapshot file
 */
export function getSnapshotFileContent(filePath: string): string | Buffer {
	// TODO: read file stream
	const content = fs.readFileSync(filePath);
	return isJsonSnapshot(content) ? content.toString() : content;
}

/**
 * Validate provided command line arguments
 * @internal
 */
export function validateCommandLineArgs(
	codeLoader?: string,
	fluidFileConverter?: IFluidFileConverter,
): string | undefined {
	if (codeLoader && fluidFileConverter !== undefined) {
		return '"codeLoader" and "fluidFileConverter" cannot both be provided. See README for details.';
	}
	if (!codeLoader && fluidFileConverter === undefined) {
		return '"codeLoader" must be provided if there is no explicit "fluidFileConverter". See README for details.';
	}
	return undefined;
}

/**
 * @internal
 */
export function getArgsValidationError(
	inputFile: string,
	outputFile: string,
	timeout?: number,
): string | undefined {
	// Validate input file
	if (!inputFile) {
		return "Input file name argument is missing.";
	} else if (!fs.existsSync(inputFile)) {
		return "Input file does not exist.";
	}

	// Validate output file
	if (!outputFile) {
		return "Output file argument is missing.";
	} else if (fs.existsSync(outputFile)) {
		return `Output file already exists [${outputFile}].`;
	}

	if (timeout !== undefined && (isNaN(timeout) || timeout < 0)) {
		return "Invalid timeout";
	}

	return undefined;
}

/**
 * @internal
 */
export async function timeoutPromise<T = void>(
	executor: (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: any) => void,
	) => void,
	timeout: number,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Timed out (${timeout}ms)`)), timeout);

		executor(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(reason) => {
				clearTimeout(timer);
				reject(reason);
			},
		);
	});
}
