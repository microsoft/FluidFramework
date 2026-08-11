/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import path from "path";

import { MockLogger } from "@fluidframework/telemetry-utils/internal";

/* eslint-disable import-x/no-internal-modules */
import type { IFluidFileConverterWithBinaryOutput } from "../codeLoaderBundle.js";
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
		execute: () => Promise.resolve(binaryExecuteResult),
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

	it("preserves internal helper text and binary output types", async () => {
		const snapshot = getSnapshotFileContent(
			path.join(snapshotFolder, "odspSnapshot1.json"),
		);
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
