/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { env } from "node:process";
import { promisify } from "node:util";

// eslint-disable-next-line import-x/no-internal-modules -- how else would one import a package.json file?
import typescriptHostPackageJson from "@fluid-example/typescript-versions-host/package.json" with {
	type: "json",
};

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

const typescriptVersions =
	// Assert all entries are in the expected format
	typescriptHostPackageJson.devDependencies satisfies Record<
		`typescript-${bigint}.${bigint}`,
		string
	>;

const execFileAsync = promisify(execFile);

/**
 * Invokes the provided version of tsc to compile code, validating that it type checks with that version of TypeScript.
 * @param tscName - The name of the TypeScript compiler package to use. Use the package aliases defined in `@fluid-example/typescript-versions-host/package.json`.
 * @param args - Additional arguments to pass to the TypeScript compiler.
 * @param project - The path to the tsconfig file to use for compilation. Defaults to ./tsconfig.test.json.
 */
async function compileTest(
	tscName: string,
	args: string[],
	project: string = "./tsconfig.test.json",
): Promise<void> {
	const compilerPath = path.join(typescriptHostDir, "node_modules", tscName, "bin", "tsc");
	const result = execFileAsync(compilerPath, ["--project", project, "--noEmit", ...args], {});

	try {
		await result;
	} catch (error) {
		const compilerError = error as {
			stdout?: string;
			stderr?: string;
			message?: string;
		};
		const details = [compilerError.stdout, compilerError.stderr, compilerError.message]
			.filter((x): x is string => x !== undefined && x.length > 0)
			.join("\n");
		throw new Error(`Failed to compile with ${tscName}:\n${details}`);
	}
}

// Compile this package using several versions of typescript to ensure the type checking in its imports (mainly fluid-framework) passes.
describe("build tests", () => {
	// Skip these tests when using CJS, as this only build for ESM, so running in both modes would be redundant.
	if (env.FLUID_TEST_MODULE_SYSTEM !== "CJS") {
		for (const [name, version] of Object.entries(typescriptVersions)) {
			it(`can build with ${name} (${version})`, async () => {
				await compileTest(name, []);
			});
		}

		describe("can build with esnext.disposable", () => {
			it.skip("typescript-6.0", async () => {
				await compileTest("typescript-6.0", ["--lib", "ES2022,DOM,esnext.disposable"]);
			});
			// Currently fails for typescript 5.6 (5.7 is our lower check bound) and newer:
			it("typescript-5.7 and newer fail", async () => {
				const compileResultPromise = compileTest("typescript-5.7", [
					"--lib",
					"ES2022,DOM,esnext.disposable",
				]);
				await assert.rejects(
					compileResultPromise,
					/areSafelyAssignable<ImportedArrayNodeIterator, ArrayIterator>/,
				);
				await assert.rejects(compileResultPromise, /Found 1 error/);
			});
		});

		describe("without DOM", () => {
			it("excluding apiExamples.spec.ts", async () => {
				await compileTest("typescript-6.0", [], "./tsconfig.test.noDOM.json");
			});

			// Errors:
			//  1. ../../../node_modules/.pnpm/@fluidframework+common-utils@3.1.0/node_modules/@fluidframework/common-utils/dist/performanceIsomorphic.d.ts:12:53 - error TS2304: Cannot find name 'Performance'.
			// Declaration dependency chain:
			//	apiExamples.spec.ts imports @fluidframework/local-driver/alpha
			//	→ local-driver/lib/alpha.d.ts → local-driver/lib/index.d.ts
			//	→   localDocumentDeltaConnection.d.ts imports @fluidframework/server-services-core
			//	→ server-services-core/dist/queue.d.ts imports @fluidframework/common-utils
			//	→ common-utils/dist/index.d.ts
			//	→   performanceIsomorphic.d.ts
			//
			// `queue.d.ts` imports `Deferred` from `@fluidframework/common-utils`; that package’s root declaration re-exports `performanceIsomorphic`, whose `Partial<Performance>` requires the DOM `Performance` type.
			//
			// 2. ../../../node_modules/.pnpm/engine.io-client@6.6.4_supports-color@10.2.2/node_modules/engine.io-client/build/esm/transports/polling-xhr.d.ts:65:58 - error TS2304: Cannot find name 'XMLHttpRequest'.
			// Declaration dependency chain:
			//	apiExamples.spec.ts imports @fluidframework/local-driver/alpha
			//	→ local-driver/lib/alpha.d.ts → local-driver/lib/index.d.ts
			//	→   localDocumentDeltaConnection.d.ts imports imports socket.io-client imports engine.io-client
			//	→ engine.io-client/build/esm/index.d.ts
			//	→   transports/polling-xhr.d.ts
			//
			// DOM requirement was introduced in commit `ee47192d4ae` (“Introduce Unified ServiceClient API”), which added:
			//	"@fluidframework/local-driver": "workspace:~"
			// to `examples/utils/import-testing/package.json`, along with the import in `src/test/apiExamples.spec.ts`:
			//	import {
			//		startEphemeralService,
			//		cleanupEphemeralService,
			//	} from "@fluidframework/local-driver/alpha";
			//
			it("including apiExamples.spec.ts reports errors from `@fluidframework/common-utils`", async () => {
				await assert.rejects(
					compileTest("typescript-6.0", ["--lib", "ES2022"]),
					/Cannot find name 'Performance'/,
				);
			});
		});

		// Several errors.
		// Many of the errors are in types with no release tag which are intended to be package private: this might indicate an issue or limitation of how we do roll-ups?
		it("exactOptionalPropertyTypes is not sufficiently supported", async () => {
			await assert.rejects(
				compileTest("typescript-6.0", ["--exactOptionalPropertyTypes"]),
				/Found \d+ error/,
			);
		});

		// Ensure the isolatedDeclarations.ts file actually builds when isolatedDeclarations is enabled.
		// Requires TypeScript 5.5 or newer.
		it("isolatedDeclarations", async () => {
			await compileTest("typescript-6.0", [], "./src/test/tsconfig.isolatedDeclarations.json");
		});
	}
});
