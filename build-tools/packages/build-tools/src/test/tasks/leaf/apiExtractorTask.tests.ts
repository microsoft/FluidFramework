/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
	getApiReportFilePaths,
	getApiReportFileState,
	useWorker,
} from "../../../fluidBuild/tasks/leaf/apiExtractorTask.js";

describe("API Extractor Task", () => {
	it("gets generated API report paths", () => {
		assert.deepEqual(
			getApiReportFilePaths({
				apiReportEnabled: true,
				reportConfigs: [
					{ fileName: "package.public.api.md" },
					{ fileName: "package.beta.api.md" },
				],
				reportFolder: "/package/api-report",
			}),
			[
				path.join("/package/api-report", "package.public.api.md"),
				path.join("/package/api-report", "package.beta.api.md"),
			],
		);
	});

	it("ignores API report paths when reports are disabled", () => {
		assert.deepEqual(
			getApiReportFilePaths({
				apiReportEnabled: false,
				reportConfigs: [{ fileName: "package.api.md" }],
				reportFolder: "/package/api-report",
			}),
			[],
		);
	});

	it("changes state when an API report changes", async () => {
		const reportFolder = await mkdtemp(path.join(tmpdir(), "fluid-build-api-report-"));
		try {
			const fileName = "package.public.api.md";
			const reportPath = path.join(reportFolder, fileName);
			const config = {
				apiReportEnabled: true,
				reportConfigs: [{ fileName }],
				reportFolder,
			};
			await writeFile(reportPath, "original");
			const originalState = await getApiReportFileState(config);

			await writeFile(reportPath, "reverted");
			const revertedState = await getApiReportFileState(config);

			assert.notDeepEqual(revertedState, originalState);
		} finally {
			await rm(reportFolder, { recursive: true });
		}
	});

	it("useWorker", () => {
		assert(useWorker("api-extractor run"));
		assert(useWorker("api-extractor run --local"));
		assert(useWorker("api-extractor run --config the/File.extension"));
		assert(useWorker("api-extractor run --local --config the/File.extension"));
		assert(!useWorker("api-extractor run --local --config the/File.extension --unsupported"));
		assert(!useWorker("api-extractor run unsupported"));
		assert(!useWorker("api-extractor run --local --config"));
	});
});
