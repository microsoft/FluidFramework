/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { serializeNodes } from "../src/processorProfiles.js";
import { createTransformRegistry } from "../src/transformRegistry.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

async function generate(
	transformName: string,
	options: Record<string, unknown>,
): Promise<string> {
	const registry = createTransformRegistry();
	const transform = registry.transforms[transformName];
	assert(transform !== undefined);
	const nodes = await transform.generate(
		options,
		registry.createContext(path.join(testDirectory, "fixture.md"), "markdown", 2),
	);
	return serializeNodes(nodes, "markdown");
}

test("library header applies public package defaults", async () => {
	const output = await generate("library-readme-header", {
		packageJsonPath: "./package.json",
		devDependency: true,
		packageScopeNotice: "EXPERIMENTAL",
	});

	assert.match(output, /^\*\*IMPORTANT: This package is experimental\.\*\*/);
	assert.match(output, /## Using Fluid Framework libraries/);
	assert.match(output, /## Installation\n\nRun this command/);
	assert.match(output, /npm i @fluidframework\/test-package -D/);
	assert.match(output, /## Importing from this package/);
	assert.match(output, /@fluidframework\/test-package\/alpha/);
	assert.match(output, /## API Documentation/);
});

test("README footer can include package scripts", async () => {
	const output = await generate("readme-footer", {
		packageJsonPath: "./package.json",
		scripts: true,
	});

	assert.match(output, /^## Scripts/);
	assert.match(output, /test-script-1/);
	assert.match(output, /## Minimum Client Requirements/);
	assert.match(output, /## Contribution Guidelines/);
	assert.match(output, /## Help/);
	assert.match(output, /## Trademark/);
});

test("template transforms apply heading options structurally", async () => {
	const output = await generate("installation-instructions", {
		packageJsonPath: "./package.json",
		includeHeading: false,
		devDependency: true,
	});

	assert.doesNotMatch(output, /Installation/);
	assert.match(output, /npm i @fluidframework\/test-package -D/);
});

test("framework package scope produces no notice", async () => {
	const output = await generate("package-scope-notice", {
		packageJsonPath: "./package.json",
		scopeKind: "FRAMEWORK",
	});

	assert.equal(output, "");
});

test("example app header honors the Tinylicious option", async () => {
	const output = await generate("example-app-readme-header", {
		packageJsonPath: "./package.json",
		usesTinylicious: false,
	});

	assert.match(output, /^## Getting Started/);
	assert.doesNotMatch(output, /start a Tinylicious server/);
	assert.match(output, /pnpm start/);
});

test("transform options reject unknown properties", async () => {
	const registry = createTransformRegistry();
	const transform = registry.transforms["library-readme-header"];
	assert(transform !== undefined);
	await assert.rejects(
		async () =>
			transform.generate(
				{ scripts: true },
				registry.createContext(path.join(testDirectory, "fixture.md"), "markdown", 2),
			),
		/Unknown option "scripts" for transform "library-readme-header"/,
	);
});

test("transform options reject null values", async () => {
	const registry = createTransformRegistry();
	const transform = registry.transforms["readme-footer"];
	assert(transform !== undefined);
	await assert.rejects(
		async () =>
			transform.generate(
				{ scripts: null },
				registry.createContext(path.join(testDirectory, "fixture.md"), "markdown", 2),
			),
		/Option "scripts" for "readme-footer" must be a boolean/,
	);
});

test("section transforms use the explicit heading level", async () => {
	const registry = createTransformRegistry();
	for (const transformName of ["api-docs", "installation-instructions", "package-scripts"]) {
		const transform = registry.transforms[transformName];
		assert(transform !== undefined);
		const nodes = await transform.generate(
			{ headingLevel: 2 },
			registry.createContext(path.join(testDirectory, "fixture.md"), "markdown", 4),
		);
		assert.equal(nodes[0]?.type, "heading");
		assert.equal(nodes[0].depth, 2);
	}
});
