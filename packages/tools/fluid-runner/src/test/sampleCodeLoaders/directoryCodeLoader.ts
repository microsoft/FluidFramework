/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type {
	IFluidFileConverterDirectoryOutput,
	IFluidFileConverterWithDirectoryOutput,
} from "../../codeLoaderBundle.js";

import { SampleCodeLoader } from "./sampleCodeLoader.js";

export const directoryTextContent = "Fluid \u03C0";
export const directoryBinaryContent = Uint8Array.from([0, 1, 127, 128, 255]);
export const racedDirectoryContent = "raced";
export const racedDirectoryFile = "marker.txt";

export const directoryExecuteResult: IFluidFileConverterDirectoryOutput = {
	directories: ["empty"],
	files: [
		{ path: "nested/readme.txt", content: directoryTextContent },
		{ path: "nested/data.bin", content: directoryBinaryContent },
	],
};

const writeFailureOutput: IFluidFileConverterDirectoryOutput = {
	files: [
		{ path: "written-before-failure.txt", content: "partial" },
		{ path: `${"x".repeat(300)}.bin`, content: directoryBinaryContent },
	],
};

const invalidOutputs: Record<string, IFluidFileConverterDirectoryOutput> = {
	traversal: {
		files: [{ path: "../outside.txt", content: "not written" }],
	},
	duplicate: {
		files: [
			{ path: "duplicate.txt", content: "first" },
			{ path: "duplicate.txt", content: "second" },
		],
	},
	conflict: {
		directories: ["conflict"],
		files: [{ path: "conflict", content: "not written" }],
	},
	writeFailure: writeFailureOutput,
};

const raceOutputRootPrefix = "raceOutputRoot:";

export const fluidExport: IFluidFileConverterWithDirectoryOutput = {
	getCodeLoader: async () => new SampleCodeLoader(),
	execute: async (_container, options) => {
		if (options?.startsWith(raceOutputRootPrefix) === true) {
			const outputRoot = options.slice(raceOutputRootPrefix.length);
			fs.mkdirSync(outputRoot);
			fs.writeFileSync(path.join(outputRoot, racedDirectoryFile), racedDirectoryContent);
		}
		return (
			(options === undefined ? undefined : invalidOutputs[options]) ?? directoryExecuteResult
		);
	},
};
