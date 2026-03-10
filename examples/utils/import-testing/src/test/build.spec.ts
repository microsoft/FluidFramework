/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { env } from "node:process";
import { promisify } from "node:util";

// When available (typescript 5.8+), update dynamic parsing to static import
// import typescriptHostPackageJson from "@fluid-example/typescript-versions-host/package.json"; : with { type: "json" };
import type { PackageJson } from "@fluidframework/build-tools";

// Resolve the typescript-versions-host package which hosts the aliased TypeScript versions.
// Use process.cwd() as the base for createRequire so this works in both ESM
// and CJS compilation modes.
// (import.meta.url is unavailable in CJS; __filename is unavailable in ESM.)
// If `process.cwd()` is found to be a problem, consider using `_dirname` from
// a .cjs (.cts) file as described in various repo dirname.cts files.
const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const typescriptHostDir = path.dirname(
	nodeRequire.resolve("@fluid-example/typescript-versions-host/package.json"),
);

const typescriptHostPackageJson = JSON.parse(
	readFileSync(path.join(typescriptHostDir, "package.json"), "utf8"),
) as Required<Pick<PackageJson, "devDependencies">>;

// All are expected to match, but be cautious.
const typescriptVersions = Object.entries(typescriptHostPackageJson.devDependencies).filter(
	([name]) => name.startsWith("typescript-"),
);

const execFileAsync = promisify(execFile);

async function compileTest(tscName: string, args: string[]): Promise<void> {
	const result = execFileAsync(
		path.join(typescriptHostDir, "node_modules", tscName, "bin", "tsc"),
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
		// That code isn't even package exported: might be fixable by fixing how we do roll-ups?
		it.skip("without DOM", async () => {
			await compileTest("typescript-5.4", ["--lib", "ES2022"]);
		});

		// Several errors.
		// Many of the errors are in types with no release tag which are intended to be package private: this might indicate an issue or limitation of how we do roll-ups?
		it.skip("exactOptionalPropertyTypes", async () => {
			await compileTest("typescript-5.4", ["--exactOptionalPropertyTypes"]);
		});
	}
});
