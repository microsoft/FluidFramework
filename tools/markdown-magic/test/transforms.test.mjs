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

async function generate(transformName, options) {
	const registry = createTransformRegistry();
	const transform = registry[transformName];
	const validatedOptions = transform.validateOptions(options);
	const nodes = await transform.generate(
		validatedOptions,
		registry.createContext(path.join(testDirectory, "fixture.md"), "markdown"),
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
	assert.match(output, /## Installation\n\nTo get started/);
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

test("transform options reject unknown properties", () => {
	const registry = createTransformRegistry();
	assert.throws(
		() => registry["library-readme-header"].validateOptions({ scripts: true }),
		/Unknown option "scripts" for transform "library-readme-header"/,
	);
});

test("transform options reject null values", () => {
	const registry = createTransformRegistry();
	assert.throws(
		() => registry["readme-footer"].validateOptions({ scripts: null }),
		/Option "scripts" for "readme-footer" must be a boolean/,
	);
});

test("section transforms reject heading levels outside 1 through 6", () => {
	const registry = createTransformRegistry();
	for (const transformName of ["api-docs", "installation-instructions", "package-scripts"]) {
		assert.throws(
			() => registry[transformName].validateOptions({ headingLevel: 0 }),
			/Option "headingLevel".*must be between 1 and 6/,
		);
		assert.throws(
			() => registry[transformName].validateOptions({ headingLevel: 7 }),
			/Option "headingLevel".*must be between 1 and 6/,
		);
	}
});
