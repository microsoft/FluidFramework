/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import path from "path";

import { MockLogger } from "@fluidframework/telemetry-utils/internal";

/* eslint-disable import-x/no-internal-modules */
import type {
	IFluidFileConverterDirectoryOutput,
	IFluidFileConverterWithBinaryOutput,
	IFluidFileConverterWithDirectoryOutput,
} from "../codeLoaderBundle.js";
import {
	createContainerAndExecute,
	createFluidRunnerContainerAndExecute,
	exportFile,
} from "../exportFile.js";
import { getSnapshotFileContent } from "../utils.js";

import { _dirname } from "./dirname.cjs";
import { fluidExport as networkFetchFluidExport } from "./sampleCodeLoaders/networkFetchCodeLoader.js";
import { executeResult, fluidExport } from "./sampleCodeLoaders/sampleCodeLoader.js";
import { fluidExport as timeoutFluidExport } from "./sampleCodeLoaders/timeoutCodeLoader.js";
/* eslint-enable import-x/no-internal-modules */

describe("exportFile", () => {
	const folderRoot = path.join(_dirname, "../../src/test");
	const outputFolder = path.join(folderRoot, "outputFolder");
	const outputFilePath = path.join(outputFolder, "result.txt");
	const telemetryFile = path.join(outputFolder, "telemetry.txt");
	const snapshotFolder = path.join(folderRoot, "localOdspSnapshots");
	const binaryExecuteResult = Uint8Array.from([0, 1, 127, 128, 255]);
	const binaryFluidExport: IFluidFileConverterWithBinaryOutput = {
		...fluidExport,
		execute: async () => binaryExecuteResult,
	};
	const directoryExecuteResult: IFluidFileConverterDirectoryOutput = {
		directories: ["empty"],
		files: [
			{ path: "nested/readme.txt", content: "Fluid \u03C0" },
			{ path: "nested/data.bin", content: binaryExecuteResult },
		],
	};
	const directoryFluidExport: IFluidFileConverterWithDirectoryOutput = {
		...fluidExport,
		execute: async () => directoryExecuteResult,
	};

	beforeEach(() => {
		fs.mkdirSync(outputFolder);
		global.fetch = (async () => {
			return undefined;
		}) as any;
	});

	afterEach(() => {
		fs.rmdirSync(outputFolder, { recursive: true });
	});

	fs.readdirSync(snapshotFolder).forEach((snapshotFileName: string) => {
		describe(`Export using snapshot [${snapshotFileName}]`, () => {
			it("Output file is correct", async () => {
				const exportFileResult = await exportFile(
					fluidExport,
					path.join(snapshotFolder, snapshotFileName),
					outputFilePath,
					telemetryFile,
				);

				assert(exportFileResult.success, "exportFile call was not successful");

				assert(fs.existsSync(outputFilePath), "result file does not exist");

				const resultFileContent = fs.readFileSync(outputFilePath, { encoding: "utf-8" });
				assert.strictEqual(resultFileContent, executeResult, "result output is not correct");
			});

			it("Execution result is correct", async () => {
				const result = await createFluidRunnerContainerAndExecute(
					getSnapshotFileContent(path.join(snapshotFolder, snapshotFileName)),
					fluidExport,
					new MockLogger().toTelemetryLogger(),
				);
				assert.deepStrictEqual(result, executeResult, "result objects do not match");
			});
		});
	});

	it("preserves internal helper text, binary, and directory output types", async () => {
		const snapshot = getSnapshotFileContent(path.join(snapshotFolder, "odspSnapshot1.json"));
		const logger = new MockLogger().toTelemetryLogger();

		const textResult: string = await createContainerAndExecute(snapshot, fluidExport, logger);
		assert.strictEqual(textResult, executeResult, "text execution output is not correct");

		const binaryResult: Uint8Array = await createContainerAndExecute(
			snapshot,
			binaryFluidExport,
			logger,
		);
		assert.deepStrictEqual(
			binaryResult,
			binaryExecuteResult,
			"binary execution output is not correct",
		);

		const directoryResult: IFluidFileConverterDirectoryOutput =
			await createContainerAndExecute(snapshot, directoryFluidExport, logger);
		assert.deepStrictEqual(
			directoryResult,
			directoryExecuteResult,
			"directory execution output is not correct",
		);
	});

	it("writes binary execution output unchanged", async () => {
		const result = await exportFile(
			binaryFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(result.success, "exportFile call was not successful");
		assert.deepStrictEqual(
			fs.readFileSync(outputFilePath),
			Buffer.from(binaryExecuteResult),
			"binary file output is not correct",
		);
	});

	it("writes mixed directory output and preserves empty directories", async () => {
		const result = await exportFile(
			directoryFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(result.success, "exportFile call was not successful");
		assert(fs.statSync(outputFilePath).isDirectory(), "output root is not a directory");
		assert(
			fs.statSync(path.join(outputFilePath, "empty")).isDirectory(),
			"empty directory was not created",
		);
		assert.strictEqual(
			fs.readFileSync(path.join(outputFilePath, "nested", "readme.txt"), "utf8"),
			"Fluid \u03C0",
			"text file output is not correct",
		);
		assert.deepStrictEqual(
			fs.readFileSync(path.join(outputFilePath, "nested", "data.bin")),
			Buffer.from(binaryExecuteResult),
			"binary directory file output is not correct",
		);
	});

	const invalidPaths = [
		{ name: "empty paths", value: "" },
		{ name: "absolute paths", value: "/outside.txt" },
		{ name: "drive paths", value: "C:/outside.txt" },
		{ name: "UNC paths", value: "//server/share/outside.txt" },
		{ name: "dot segments", value: "./outside.txt" },
		{ name: "parent traversal", value: "nested/../outside.txt" },
		{ name: "backslashes", value: "nested\\outside.txt" },
		{ name: "NUL bytes", value: "outside\0.txt" },
	];
	for (const invalidPath of invalidPaths) {
		it(`rejects directory output with ${invalidPath.name} before creating the root`, async () => {
			const secretContent = "document-controlled-secret";
			const invalidConverter: IFluidFileConverterWithDirectoryOutput = {
				...directoryFluidExport,
				execute: async () => ({
					files: [{ path: invalidPath.value, content: secretContent }],
				}),
			};

			const result = await exportFile(
				invalidConverter,
				path.join(snapshotFolder, "odspSnapshot1.json"),
				outputFilePath,
				telemetryFile,
			);

			assert(!result.success, "exportFile call should fail");
			assert(!fs.existsSync(outputFilePath), "invalid output root should not be created");
			assert.strictEqual(
				result.error?.message,
				"Invalid Fluid file converter directory output",
				"unexpected validation error",
			);
			const telemetry = fs.readFileSync(telemetryFile, "utf8");
			assert(
				!telemetry.includes(invalidPath.value) && !telemetry.includes(secretContent),
				"converter-controlled path or content was included in telemetry",
			);
		});
	}

	it("rejects traversal in an explicit directory path before creating the root", async () => {
		const invalidConverter: IFluidFileConverterWithDirectoryOutput = {
			...directoryFluidExport,
			execute: async () => ({ directories: ["../outside"], files: [] }),
		};

		const result = await exportFile(
			invalidConverter,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(!result.success, "exportFile call should fail");
		assert(!fs.existsSync(outputFilePath), "invalid output root should not be created");
	});

	const conflictingOutputs: {
		readonly name: string;
		readonly output: IFluidFileConverterDirectoryOutput;
	}[] = [
		{
			name: "duplicate file paths",
			output: {
				files: [
					{ path: "duplicate.txt", content: "first" },
					{ path: "duplicate.txt", content: "second" },
				],
			},
		},
		{
			name: "duplicate directory paths",
			output: { directories: ["duplicate", "duplicate"], files: [] },
		},
		{
			name: "file and directory path conflicts",
			output: {
				directories: ["conflict"],
				files: [{ path: "conflict", content: "content" }],
			},
		},
		{
			name: "file and descendant path conflicts",
			output: {
				files: [
					{ path: "conflict", content: "parent" },
					{ path: "conflict/child.txt", content: "child" },
				],
			},
		},
	];
	for (const conflictingOutput of conflictingOutputs) {
		it(`rejects directory output with ${conflictingOutput.name}`, async () => {
			const invalidConverter: IFluidFileConverterWithDirectoryOutput = {
				...directoryFluidExport,
				execute: async () => conflictingOutput.output,
			};

			const result = await exportFile(
				invalidConverter,
				path.join(snapshotFolder, "odspSnapshot1.json"),
				outputFilePath,
				telemetryFile,
			);

			assert(!result.success, "exportFile call should fail");
			assert(!fs.existsSync(outputFilePath), "conflicting output root should not be created");
		});
	}

	it("does not replace an existing directory output root", async () => {
		const markerPath = path.join(outputFilePath, "marker.txt");
		fs.mkdirSync(outputFilePath);
		fs.writeFileSync(markerPath, "existing");

		const result = await exportFile(
			directoryFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(!result.success, "exportFile call should fail");
		assert.strictEqual(fs.readFileSync(markerPath, "utf8"), "existing");
	});

	it("does not replace a directory output root created during conversion", async () => {
		const markerPath = path.join(outputFilePath, "marker.txt");
		const racingConverter: IFluidFileConverterWithDirectoryOutput = {
			...directoryFluidExport,
			execute: async () => {
				fs.mkdirSync(outputFilePath);
				fs.writeFileSync(markerPath, "raced");
				return directoryExecuteResult;
			},
		};

		const result = await exportFile(
			racingConverter,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(!result.success, "exportFile call should fail");
		assert.strictEqual(result.error?.code, "EEXIST", "expected an exclusive-root error");
		assert.strictEqual(fs.readFileSync(markerPath, "utf8"), "raced");
	});

	it("cleans up a partially written directory output", async () => {
		const longFileName = `${"x".repeat(300)}.bin`;
		const failingConverter: IFluidFileConverterWithDirectoryOutput = {
			...directoryFluidExport,
			execute: async () => ({
				files: [
					{ path: "written-before-failure.txt", content: "partial" },
					{ path: longFileName, content: binaryExecuteResult },
				],
			}),
		};

		const result = await exportFile(
			failingConverter,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(!result.success, "exportFile call should fail");
		assert(!fs.existsSync(outputFilePath), "partial output root was not removed");
		assert.strictEqual(
			result.error?.message,
			"Failed to materialize Fluid file converter directory output",
			"unexpected write failure",
		);
		assert(
			!fs.readFileSync(telemetryFile, "utf8").includes(longFileName),
			"converter-controlled path was included in telemetry",
		);
	});

	it("does not overwrite an output file created during conversion", async () => {
		const racedOutput = Uint8Array.from([222, 173, 190, 239]);
		const racingFluidExport: IFluidFileConverterWithBinaryOutput = {
			...binaryFluidExport,
			execute: async () => {
				fs.writeFileSync(outputFilePath, racedOutput);
				return binaryExecuteResult;
			},
		};

		const result = await exportFile(
			racingFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(!result.success, "exportFile call should fail");
		assert.strictEqual(result.error?.code, "EEXIST", "expected an exclusive-write error");
		assert.deepStrictEqual(
			fs.readFileSync(outputFilePath),
			Buffer.from(racedOutput),
			"the raced output file was overwritten",
		);
	});

	it("fails on timeout", async () => {
		const result = await exportFile(
			timeoutFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
			undefined,
			undefined,
			1,
		);

		assert(!result.success, "result should not be successful");
		assert(
			result.error?.message.toLowerCase().includes("timed out"),
			`error message does not contain "timed out" [${result.error?.message}]`,
		);
	});

	it("fails on disallowed network fetch", async () => {
		const result = await exportFile(
			networkFetchFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
			undefined,
			undefined,
			undefined,
			true,
		);

		assert(!result.success, "result should not be successful");
		assert(
			result.error?.message.toLowerCase().includes("network fetch"),
			`error message does not contain "network fetch" [${result.error?.message}]`,
		);
	});

	it("succeeds when allowed network fetch occurs", async () => {
		const result = await exportFile(
			networkFetchFluidExport,
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
			undefined,
			undefined,
			undefined,
			false,
		);

		assert(result.success, "result should be successful");
	});

	describe("Validate arguments", () => {
		const snapshotFilePath = path.join(snapshotFolder, "odspSnapshot1.json");

		it("input file", async () => {
			const result = await exportFile(
				fluidExport,
				"nonExistentFile.json",
				outputFilePath,
				telemetryFile,
			);

			assert(!result.success, "result should not be successful");
			assert(
				result.errorMessage.toLowerCase().includes("input file"),
				`error message does not contain "input file" [${result.errorMessage}]`,
			);
		});

		it("output file", async () => {
			const result = await exportFile(
				fluidExport,
				snapshotFilePath,
				snapshotFilePath, // output file already exists
				telemetryFile,
			);

			assert(!result.success, "result should not be successful");
			assert(
				result.errorMessage.toLowerCase().includes("output file"),
				`error message does not contain "output file" [${result.errorMessage}]`,
			);
		});

		it("timeout", async () => {
			const result = await exportFile(
				fluidExport,
				snapshotFilePath,
				outputFilePath,
				telemetryFile,
				undefined,
				undefined,
				-1,
			);

			assert(!result.success, "result should not be successful");
			assert(
				result.errorMessage.toLowerCase().includes("timeout"),
				`error message does not contain "timeout" [${result.errorMessage}]`,
			);
		});
	});
});
