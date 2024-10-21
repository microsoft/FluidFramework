/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { PackageJson } from "@fluidframework/build-tools";
import chai from "chai";
import assertArrays from "chai-arrays";
import { readJsonSync, writeJson } from "fs-extra/esm";

import { getTestDataPath, initializeCommandTestFunction } from "../../init.js";

const test = initializeCommandTestFunction(import.meta.url);
chai.use(assertArrays);

describe("flub check dependencyRanges", () => {
	const examplePackagePath = path.join(getTestDataPath(), "example-package", "package.json");
	const originalJson = readJsonSync(examplePackagePath) as PackageJson;

	// after(async () => {
	// 	await writeJson(examplePackagePath, originalJson, { spaces: "\t" });
	// });

	// describe("no invalid ranges", () => {
	test
		.stdout()
		.command(["check:dependencyRanges", "--dir", path.dirname(examplePackagePath)])
		.finally(async () => {
			await writeJson(examplePackagePath, originalJson, { spaces: "\t" });
		})
		.end(`succeeds when no invalid ranges`);
	// });

	describe("no invalid ranges", () => {
		test
			.do(async () => {
				const newJson = JSON.parse(JSON.stringify(originalJson)) as PackageJson;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				newJson.dependencies!["@fluid-internal/mocha-test-setup"] = "^2.0.0-internal.8.0.0";
				await writeJson(examplePackagePath, newJson, { spaces: "\t" });
			})
			.finally(async () => {
				await writeJson(examplePackagePath, originalJson, { spaces: "\t" });
			})
			.stdout()
			.command(["check:dependencyRanges", "--dir", path.dirname(examplePackagePath)])
			.exit(100)
			.end(`fails with invalid ranges`);
	});
});
