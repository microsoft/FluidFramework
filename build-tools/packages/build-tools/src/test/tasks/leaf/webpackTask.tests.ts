/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getWebpackConfigExport } from "../../../fluidBuild/tasks/leaf/webpackTask.js";
import { loadModule } from "../../../fluidBuild/tasks/taskUtils.js";

describe("WebpackTask", () => {
	it("gets the default export from an ESM JavaScript config", async () => {
		const moduleDirectory = await mkdtemp(path.join(tmpdir(), "fluid-build-webpack-config-"));
		try {
			await writeFile(path.join(moduleDirectory, "package.json"), '{ "type": "module" }');
			const modulePath = path.join(moduleDirectory, "webpack.config.js");
			await writeFile(
				modulePath,
				"export default (env) => ({ mode: env.production ? 'production' : 'development' });",
			);

			const configModule = await loadModule(modulePath, "module");
			const configFactory = getWebpackConfigExport(configModule);
			assert.equal(typeof configFactory, "function");
			assert.deepEqual(
				(configFactory as (env: { production: boolean }) => unknown)({ production: true }),
				{ mode: "production" },
			);
		} finally {
			await rm(moduleDirectory, { recursive: true });
		}
	});

	it("preserves a CommonJS config object with a default property", () => {
		const config = { default: "entry-name", mode: "production" };
		assert.equal(getWebpackConfigExport(config), config);
	});
});
