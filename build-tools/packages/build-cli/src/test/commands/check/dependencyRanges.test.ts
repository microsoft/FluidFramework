/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import type { PackageJson } from "@fluidframework/build-tools";
import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { readJsonSync, writeJson } from "fs-extra/esm";

import { testDataPath } from "../../init.js";

describe("flub check dependencyRanges", () => {
	const examplePackagePath = path.join(testDataPath, "example-package", "package.json");
	const originalJson = readJsonSync(examplePackagePath) as PackageJson;

	afterEach(async () => {
		// restore the original JSON
		await writeJson(examplePackagePath, originalJson, { spaces: "\t" });
	});

	it("succeeds when no invalid ranges", async () => {
		const { error, stdout } = await runCommand(
			["check:dependencyRanges", "--dir", path.dirname(examplePackagePath)],
			{
				root: import.meta.url,
			},
		);

		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(error?.oclif?.exit).to.be.undefined;
		expect(stdout).to.include("Done. 1 Packages. 0 Errors");
	});

	it("fails with invalid ranges", async () => {
		const newJson = JSON.parse(JSON.stringify(originalJson)) as PackageJson;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		newJson.dependencies!["@fluid-internal/mocha-test-setup"] = "^2.0.0-internal.8.0.0";
		await writeJson(examplePackagePath, newJson, { spaces: "\t" });

		const { error } = await runCommand(
			["check:dependencyRanges", "--dir", path.dirname(examplePackagePath)],
			{
				root: import.meta.url,
			},
		);

		expect(error?.oclif?.exit).to.equal(100);
	});
});
