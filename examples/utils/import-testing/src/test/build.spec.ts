/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { env } from "node:process";
import { promisify } from "node:util";

const packageJson = fs.readFileSync("package.json");
const packageObj = JSON.parse(packageJson.toString()) as {
	devDependencies: Record<string, string>;
};
const devDependencies = packageObj.devDependencies;

const typescriptVersions = Object.entries(devDependencies).filter(([name]) =>
	name.startsWith("typescript-"),
);

const execFileAsync = promisify(execFile);

// TODO: cases which do not build, but probably should:
// - Building with `"lib": ["ES2022"]` (missing "DOM"): Error: ../../../packages/utils/telemetry-utils/lib/config.d.ts(37,56): error TS2304: Cannot find name 'Storage'.
// - Building with `"lib": ["ES2022", "DOM", "esnext.disposable"]` and TS 5.6 or newer
// - Building with `"exactOptionalPropertyTypes": true`

async function compileTest(tscName: string, args: string[]): Promise<void> {
	const result = execFileAsync(
		`./node_modules/${tscName}/bin/tsc`,
		["--project", "./tsconfig.test.json", "--noEmit", ...args],
		{},
	);

	try {
		await result;
	} catch (error) {
		throw new Error((error as Record<string, string>).stdout);
	}
}

// Compile this package using several versions of typescript to ensure the type checking in its imports (mainly fluid-framework) passes.
describe("build tests", () => {
	// Skip these tests when using CJS, as this only build for ESM, so running in both modes would be redundant.
	if (env.FLUID_TEST_MODULE_SYSTEM !== "CJS") {
		for (const [name, version] of typescriptVersions) {
			it(`can build with ${name} (${version})`, async () => {
				await compileTest(name, []);
			});
		}

		describe("can build with esnext.disposable", () => {
			it("typescript-5.5", async () => {
				await compileTest("typescript-5.5", ["--lib", "ES2022,DOM,esnext.disposable"]);
			});
			// Currently fails for typescript 5.6 and newer:
			it.skip("typescript-5.6", async () => {
				await compileTest("typescript-5.6", ["--lib", "ES2022,DOM,esnext.disposable"]);
			});
		});

		// Error: ../../../packages/utils/telemetry-utils/lib/config.d.ts(37,56): error TS2304: Cannot find name 'Storage'.
		it.skip("without DOM", async () => {
			await compileTest("typescript-5.4", ["--lib", "ES2022"]);
		});

		// Several errors
		it.skip("exactOptionalPropertyTypes", async () => {
			await compileTest("typescript-5.4", ["--exactOptionalPropertyTypes"]);
		});
	}
});
