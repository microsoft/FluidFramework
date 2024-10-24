/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import path from "path";

import { parseBundleAndExportFile } from "../parseBundleAndExportFile.js";

import { _dirname } from "./dirname.cjs";
// eslint-disable-next-line import/no-internal-modules
import { executeResult } from "./sampleCodeLoaders/sampleCodeLoader.js";

describe("parseBundleAndExportFile", () => {
	const folderRoot = path.join(_dirname, "../../src/test");
	const outputFolder = path.join(folderRoot, "outputFolder");
	const outputFilePath = path.join(outputFolder, "result.txt");
	const telemetryFile = path.join(outputFolder, "telemetry.txt");
	const snapshotFolder = path.join(folderRoot, "localOdspSnapshots");
	const sampleCodeLoadersFolder = path.join(_dirname, "sampleCodeLoaders");

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
				const exportFileResult = await parseBundleAndExportFile(
					path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
					path.join(snapshotFolder, snapshotFileName),
					outputFilePath,
					telemetryFile,
				);

				assert(exportFileResult.success, "exportFile call was not successful");

				assert(fs.existsSync(outputFilePath), "result file does not exist");

				const resultFileContent = fs.readFileSync(outputFilePath, { encoding: "utf-8" });
				assert.strictEqual(resultFileContent, executeResult, "result output is not correct");
			});
		});
	});

	it("fails on timeout", async () => {
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "timeoutCodeLoader.js"),
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
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "networkFetchCodeLoader.js"),
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
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "networkFetchCodeLoader.js"),
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

		it("codeLoaderBundle", async () => {
			const result = await parseBundleAndExportFile(
				path.join(sampleCodeLoadersFolder, "badCodeLoader.js"),
				snapshotFilePath,
				outputFilePath,
				telemetryFile,
			);

			assert(!result.success, "result should not be successful");
			assert(
				result.errorMessage.includes("ICodeLoaderBundle"),
				`error message does not contain "ICodeLoaderBundle" [${result.errorMessage}]`,
			);
		});

		it("codeLoaderBundle.fluidExport", async () => {
			const result = await parseBundleAndExportFile(
				path.join(sampleCodeLoadersFolder, "badFluidFileConverter.js"),
				snapshotFilePath,
				outputFilePath,
				telemetryFile,
			);

			assert(!result.success, "result should not be successful");
			assert(
				result.errorMessage.includes("IFluidFileConverter"),
				`error message does not contain "IFluidFileConverter" [${result.errorMessage}]`,
			);
		});

		it("input file", async () => {
			const result = await parseBundleAndExportFile(
				path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
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
			const result = await parseBundleAndExportFile(
				path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
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
			const result = await parseBundleAndExportFile(
				path.join(sampleCodeLoadersFolder, "sampleCodeLoader.js"),
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
