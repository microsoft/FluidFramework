/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import path from "path";

import { parseBundleAndExportFile } from "../parseBundleAndExportFile.js";

import { _dirname } from "./dirname.cjs";
// eslint-disable-next-line import-x/no-internal-modules
import {
	binaryExecuteResult,
	racedOutput,
} from "./sampleCodeLoaders/binaryCodeLoader.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	directoryBinaryContent,
	directoryTextContent,
	racedDirectoryContent,
	racedDirectoryFile,
} from "./sampleCodeLoaders/directoryCodeLoader.js";
// eslint-disable-next-line import-x/no-internal-modules
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

	it("writes dynamic-bundle binary output unchanged", async () => {
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "binaryCodeLoader.js"),
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

	it("writes dynamic-bundle mixed directory output and empty directories", async () => {
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "directoryCodeLoader.js"),
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
			directoryTextContent,
			"text file output is not correct",
		);
		assert.deepStrictEqual(
			fs.readFileSync(path.join(outputFilePath, "nested", "data.bin")),
			Buffer.from(directoryBinaryContent),
			"binary directory file output is not correct",
		);
	});

	for (const invalidOutput of ["traversal", "duplicate", "conflict"]) {
		it(`rejects dynamic-bundle ${invalidOutput} directory output`, async () => {
			const result = await parseBundleAndExportFile(
				path.join(sampleCodeLoadersFolder, "directoryCodeLoader.js"),
				path.join(snapshotFolder, "odspSnapshot1.json"),
				outputFilePath,
				telemetryFile,
				invalidOutput,
			);

			assert(!result.success, "exportFile call should fail");
			assert(!fs.existsSync(outputFilePath), "invalid output root should not be created");
		});
	}

	it("does not replace a directory root created by a dynamic bundle", async () => {
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "directoryCodeLoader.js"),
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
			`raceOutputRoot:${outputFilePath}`,
		);

		assert(!result.success, "exportFile call should fail");
		assert.strictEqual(result.error?.code, "EEXIST", "expected an exclusive-root error");
		assert.strictEqual(
			fs.readFileSync(path.join(outputFilePath, racedDirectoryFile), "utf8"),
			racedDirectoryContent,
			"the raced directory root was replaced",
		);
	});

	it("does not replace an existing directory root for a dynamic bundle", async () => {
		const markerPath = path.join(outputFilePath, racedDirectoryFile);
		fs.mkdirSync(outputFilePath);
		fs.writeFileSync(markerPath, racedDirectoryContent);

		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "directoryCodeLoader.js"),
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
		);

		assert(!result.success, "exportFile call should fail");
		assert.strictEqual(
			fs.readFileSync(markerPath, "utf8"),
			racedDirectoryContent,
			"the existing directory root was replaced",
		);
	});

	it("cleans up dynamic-bundle directory output after a write failure", async () => {
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "directoryCodeLoader.js"),
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
			"writeFailure",
		);

		assert(!result.success, "exportFile call should fail");
		assert(!fs.existsSync(outputFilePath), "partial output root was not removed");
	});

	it("does not overwrite an output file created by a dynamic bundle", async () => {
		const result = await parseBundleAndExportFile(
			path.join(sampleCodeLoadersFolder, "binaryCodeLoader.js"),
			path.join(snapshotFolder, "odspSnapshot1.json"),
			outputFilePath,
			telemetryFile,
			outputFilePath,
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
