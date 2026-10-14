/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import execa from "execa";
import { afterEach, beforeEach, describe, it } from "mocha";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../../../../bin/run.js");
const testResourceDirectory = path.join(__dirname, "fixtures", "fluid-imports");
const packageResourcePrefix = `packages${path.sep}`;
const testResourceFiles = [
	"package.json",
	"source.ts",
	"tsconfig.json",
	"packages/@fluidframework/flub-imports-fixture/package.json",
	"packages/@fluidframework/flub-imports-fixture/index.d.ts",
	"packages/@fluidframework/flub-imports-fixture/flub-alpha.d.ts",
	"packages/@fluidframework/flub-imports-fixture/flub-beta.d.ts",
	"packages/@fluidframework/flub-imports-fixture/flub-internal.d.ts",
	"packages/@fluidframework/flub-imports-fixture/flub-legacy.d.ts",
	"packages/@fluidframework/flub-imports-fixture/flub-legacy-alpha.d.ts",
	"packages/@fluidframework/flub-imports-fixture/flub-legacy-beta.d.ts",
	"packages/@fluidframework/flub-imports-no-internal-fixture/package.json",
	"packages/@fluidframework/flub-imports-no-internal-fixture/index.d.ts",
	"packages/@fluidframework/flub-imports-no-internal-fixture/flub-beta.d.ts",
] as const;

let testDirectory: string | undefined;
let sourcePath: string;
let tsconfigPath: string;

async function runFluidImports(args: string[] = []): Promise<string> {
	const result = await execa(
		process.execPath,
		[cliPath, "modify", "fluid-imports", "--tsconfigs", tsconfigPath, "--quiet", ...args],
		{
			cwd: testDirectory,
			reject: false,
		},
	);
	expect(result.exitCode, result.stderr).to.equal(0);

	return readFile(sourcePath, "utf8");
}

async function createTestWorkspace(): Promise<string> {
	const directory = await mkdtemp(path.join(tmpdir(), "fluid-imports-test-"));
	try {
		await Promise.all(
			testResourceFiles.map(async (resourcePath) => {
				const normalizedResourcePath = resourcePath.split("/").join(path.sep);
				const destinationPath = normalizedResourcePath.startsWith(packageResourcePrefix)
					? path.join(
							directory,
							"node_modules",
							normalizedResourcePath.slice(packageResourcePrefix.length),
						)
					: path.join(directory, normalizedResourcePath);
				await mkdir(path.dirname(destinationPath), { recursive: true });
				await copyFile(
					path.join(testResourceDirectory, normalizedResourcePath),
					destinationPath,
				);
			}),
		);
		return directory;
	} catch (error) {
		await rm(directory, { recursive: true, force: true, maxRetries: 3 });
		throw error;
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
}

function expectNamedImportFrom(source: string, name: string, moduleSpecifier: string): void {
	expect(source).to.match(
		new RegExp(
			`import\\s*(?:type\\s*)?\\{[^}]*\\b${escapeRegExp(name)}\\b[^}]*\\}\\s*from "${escapeRegExp(moduleSpecifier)}";`,
		),
	);
}

describe("flub modify fluid-imports", () => {
	beforeEach(async () => {
		testDirectory = undefined;
		testDirectory = await createTestWorkspace();
		sourcePath = path.join(testDirectory, "source.ts");
		tsconfigPath = path.join(testDirectory, "tsconfig.json");
	});
	afterEach(async () => {
		if (testDirectory !== undefined) {
			await rm(testDirectory, { recursive: true, force: true, maxRetries: 3 });
		}
	});

	it("uses direct membership and legacy compatibility paths for each import", async () => {
		const updatedSource = await runFluidImports();

		expectNamedImportFrom(
			updatedSource,
			"createChildLogger as legacyChildLogger",
			"@fluidframework/flub-imports-fixture/legacy",
		);
		expectNamedImportFrom(
			updatedSource,
			"createChildLogger as internalChildLogger",
			"@fluidframework/flub-imports-fixture/legacy",
		);
		expectNamedImportFrom(
			updatedSource,
			"publicSymbol as publicAlias",
			"@fluidframework/flub-imports-fixture",
		);
		expectNamedImportFrom(
			updatedSource,
			"type BetaType as BetaTypeAlias",
			"@fluidframework/flub-imports-fixture/beta",
		);
		expectNamedImportFrom(
			updatedSource,
			"betaSymbol",
			"@fluidframework/flub-imports-fixture/beta",
		);
		expectNamedImportFrom(
			updatedSource,
			"alphaSymbol",
			"@fluidframework/flub-imports-fixture/alpha",
		);
		expectNamedImportFrom(
			updatedSource,
			"legacyPreferredAlpha",
			"@fluidframework/flub-imports-fixture/legacy",
		);
		expectNamedImportFrom(
			updatedSource,
			"dedicatedLegacyBeta",
			"@fluidframework/flub-imports-fixture/legacy/beta",
		);
		expectNamedImportFrom(
			updatedSource,
			"dedicatedLegacyAlpha",
			"@fluidframework/flub-imports-fixture/legacy/alpha",
		);
		expectNamedImportFrom(
			updatedSource,
			"NoInternalBeta",
			"@fluidframework/flub-imports-no-internal-fixture/beta",
		);
		expectNamedImportFrom(
			updatedSource,
			"legacyBetaFallback",
			"@fluidframework/flub-imports-fixture/legacy",
		);
		expectNamedImportFrom(
			updatedSource,
			"legacyAlphaFallback",
			"@fluidframework/flub-imports-fixture/legacy",
		);
		expect(updatedSource).to.include(
			`import type { InternalOnly as InternalOnlyType } from "@fluidframework/flub-imports-fixture/internal";`,
		);
		expect(updatedSource).to.include("// Keep this comment with the internal import.");
		expect(updatedSource).to.match(
			/\/\/ Keep this comment with the internal import\.\s*import\s*{[\S\s]*internalOnly[\S\s]*}\s*from "@fluidframework\/flub-imports-fixture\/internal";/,
		);

		const typeInternalImport = updatedSource.indexOf(
			`import type { InternalOnly as InternalOnlyType } from "@fluidframework/flub-imports-fixture/internal";`,
		);
		const rootImport = updatedSource.indexOf(`from "@fluidframework/flub-imports-fixture";`);
		const internalImport = updatedSource.indexOf(
			`// Keep this comment with the internal import.`,
		);
		const betaImport = updatedSource.indexOf(
			`from "@fluidframework/flub-imports-fixture/beta";`,
		);
		const legacyImport = updatedSource.indexOf(
			`from "@fluidframework/flub-imports-fixture/legacy";`,
		);
		expect(typeInternalImport).to.be.lessThan(rootImport);
		expect(rootImport).to.be.lessThan(internalImport);
		expect(internalImport).to.be.lessThan(betaImport);
		expect(betaImport).to.be.lessThan(legacyImport);
	});

	it("keeps unknown-tag exports on the established root fallback", async () => {
		const updatedSource = await runFluidImports();

		expectNamedImportFrom(
			updatedSource,
			"untaggedBetaSymbol",
			"@fluidframework/flub-imports-fixture",
		);
	});

	it("keeps public imports public and maps every other API to internal with --onlyInternal", async () => {
		const updatedSource = await runFluidImports(["--onlyInternal"]);

		expectNamedImportFrom(
			updatedSource,
			"publicSymbol as publicAlias",
			"@fluidframework/flub-imports-fixture",
		);
		expect(updatedSource).to.include("createChildLogger as legacyChildLogger");
		expect(updatedSource).to.include("createChildLogger as internalChildLogger");
		expect(updatedSource).to.include("type BetaType as BetaTypeAlias");
		expect(updatedSource).to.not.include(
			`from "@fluidframework/flub-imports-fixture/legacy";`,
		);
		expect(updatedSource).to.not.include(`from "@fluidframework/flub-imports-fixture/beta";`);
		expectNamedImportFrom(
			updatedSource,
			"NoInternalBeta",
			"@fluidframework/flub-imports-no-internal-fixture",
		);
	});
});
