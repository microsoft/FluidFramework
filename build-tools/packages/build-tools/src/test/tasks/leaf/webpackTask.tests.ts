/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import path from "node:path";

import {
	getWebpackConfigExport,
	getWebpackDoneFileContent,
} from "../../../fluidBuild/tasks/leaf/webpackTask.js";
import { loadModule } from "../../../fluidBuild/tasks/taskUtils.js";
import { testDataPath } from "../../init.js";

describe("WebpackTask", () => {
	for (const extension of ["js", "mjs", "cjs"]) {
		it(`gets the config factory from a .${extension} config`, async () => {
			const modulePath = path.join(testDataPath, "webpack", `webpack.config.${extension}`);
			const configModule = await loadModule(modulePath, "module");
			const configFactory = getWebpackConfigExport(configModule);
			assert.equal(typeof configFactory, "function");
			assert.deepEqual(
				(configFactory as (env: { production: boolean }) => unknown)({ production: true }),
				{ extension, mode: "production" },
			);
		});
	}

	it("preserves a CommonJS config object with a default property", () => {
		const config = { default: "entry-name", mode: "production" };
		assert.equal(getWebpackConfigExport(config), config);
	});

	it("produces different done-file content for different config factory results", async () => {
		const configFactory = (env: { production?: boolean }): { mode: string } => ({
			mode: env.production === true ? "production" : "development",
		});
		const srcFiles = ["src/index.ts", "src/utils.ts"];
		let activeHashCount = 0;
		let maximumActiveHashCount = 0;
		const getSourceHash = async (srcFile: string): Promise<string> => {
			activeHashCount++;
			maximumActiveHashCount = Math.max(maximumActiveHashCount, activeHashCount);
			await Promise.resolve();
			activeHashCount--;
			return `${srcFile}-hash`;
		};
		const production = await getWebpackDoneFileContent(
			configFactory,
			{ production: true },
			"1",
			srcFiles,
			getSourceHash,
		);
		const development = await getWebpackDoneFileContent(
			configFactory,
			{},
			"1",
			srcFiles,
			getSourceHash,
		);

		assert.deepEqual(JSON.parse(production), {
			version: "1",
			config: { mode: "production" },
			sources: {
				"src/index.ts": "src/index.ts-hash",
				"src/utils.ts": "src/utils.ts-hash",
			},
		});
		assert.equal(maximumActiveHashCount, srcFiles.length);
		assert.notEqual(production, development);
	});
});
