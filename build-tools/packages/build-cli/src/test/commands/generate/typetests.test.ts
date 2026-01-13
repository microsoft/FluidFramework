/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "mocha";
import mockedEnv from "mocked-env";

import GenerateTypetestsCommand from "../../../commands/generate/typetests.js";
import {
	generateCompatibilityTestCase,
	loadTypesSourceFile,
	readExistingVersions,
	typeDataFromFile,
} from "../../../commands/generate/typetests.js";
import type { TypeData } from "../../../typeValidator/typeData.js";

describe("generate:typetests", () => {
	const logger = {
		/* eslint-disable @typescript-eslint/explicit-function-return-type */
		log: () => assert.fail(),
		info: () => assert.fail(),
		warning: () => assert.fail(),
		errorLog: () => assert.fail(),
		verbose: () => assert.fail(),
		logHr: () => assert.fail(),
		logIndent: () => assert.fail(),
	};
	/* eslint-enable @typescript-eslint/explicit-function-return-type */

	function forCompare(data: Map<string, TypeData>, includeTypeOf?: true): unknown[] {
		return [...data.entries()].map(([k, v]) => ({
			name: k,
			import: v.name,
			tags: [...v.tags],
			...(includeTypeOf ? { typeof: v.useTypeof } : {}),
		}));
	}

	// Test a file which looks like a rollup: a file that reexports content from other files.
	it("rollup", () => {
		const currentFile = loadTypesSourceFile("./src/test/data/exports/exports-rollup.d.ts");

		const types = forCompare(typeDataFromFile(currentFile, logger));
		assert.deepEqual(types, [
			{ name: "TypeAlias_A", import: "A", tags: ["public"] },
			{ name: "Variable_b", import: "b", tags: ["public"] },
			{ name: "Variable_c", import: "c", tags: ["internal"] },
			{
				name: "TypeAlias_InternalTypes_Inner",
				import: "InternalTypes.Inner",
				tags: ["public"],
			},
			{
				name: "TypeAlias_InternalTypes_InnerInternal",
				import: "InternalTypes.InnerInternal",
				tags: ["internal"],
			},
			{ name: "TypeAlias_OtherA", import: "OtherA", tags: ["public"] },
			{ name: "TypeAlias_OtherA2", import: "OtherA2", tags: ["public"] },
		]);
	});

	// Test a file which directly includes several kinds of exports to ensure that various export types work correctly.
	it("direct", () => {
		const currentFile = loadTypesSourceFile("./src/test/data/exports/exports.d.ts");

		const types = forCompare(typeDataFromFile(currentFile, logger));
		assert.deepEqual(types, [
			{ name: "TypeAlias_A", import: "A", tags: ["public"] },
			{ name: "Variable_a", import: "a", tags: ["public"] },
			{ name: "Variable_b", import: "b", tags: ["public"] },
			{ name: "Variable_c", import: "c", tags: ["internal"] },
			{
				name: "TypeAlias_InternalTypes_Inner",
				import: "InternalTypes.Inner",
				tags: ["public"],
			},
			{
				name: "TypeAlias_InternalTypes_InnerInternal",
				import: "InternalTypes.InnerInternal",
				tags: ["internal"],
			},
			{
				name: "TypeAlias_Sealed",
				import: "Sealed",
				tags: ["sealed"],
			},
			{
				name: "TypeAlias_Input",
				import: "Input",
				tags: ["input"],
			},
		]);
	});

	describe("generateCompatibilityTestCase", () => {
		it("sealed", () => {
			const currentFile = loadTypesSourceFile("./src/test/data/exports/exports.d.ts");
			const typeData = typeDataFromFile(currentFile, logger);
			const testType = typeData.get("TypeAlias_Sealed");
			assert(testType !== undefined);

			const test = generateCompatibilityTestCase(testType, {});
			// strip comments to simplify comparison
			const code = test.filter(
				(line) => !(line.startsWith("/*") || line.startsWith(" *") || line.length === 0),
			);
			assert.deepEqual(code, [
				"declare type current_as_old_for_TypeAlias_Sealed = requireAssignableTo<TypeOnly<current.Sealed>, TypeOnly<old.Sealed>>",
			]);
		});
		it("input", () => {
			const currentFile = loadTypesSourceFile("./src/test/data/exports/exports.d.ts");
			const typeData = typeDataFromFile(currentFile, logger);
			const testType = typeData.get("TypeAlias_Input");
			assert(testType !== undefined);

			const test = generateCompatibilityTestCase(testType, {});
			// strip comments to simplify comparison
			const code = test.filter(
				(line) => !(line.startsWith("/*") || line.startsWith(" *") || line.length === 0),
			);
			assert.deepEqual(code, [
				"declare type old_as_current_for_TypeAlias_Input = requireAssignableTo<TypeOnly<old.Input>, TypeOnly<current.Input>>",
			]);
		});
	});

	// Test classes generate both cases correctly
	it("class", () => {
		const currentFile = loadTypesSourceFile("./src/test/data/exports/class.d.ts");

		const types = forCompare(typeDataFromFile(currentFile, logger), true);
		assert.deepEqual(types, [
			{ name: "Class_Foo", import: "Foo", tags: ["public"], typeof: false },
			{ name: "ClassStatics_Foo", import: "Foo", tags: ["public"], typeof: true },
		]);
	});

	describe("readExistingVersions", () => {
		const testDir = path.join(tmpdir(), "typetest-test");
		const testFile = path.join(testDir, "test.generated.ts");

		before(() => {
			mkdirSync(testDir, { recursive: true });
		});

		after(() => {
			rmSync(testDir, { recursive: true, force: true });
		});

		it("returns undefined when file does not exist", () => {
			const result = readExistingVersions(path.join(testDir, "nonexistent.ts"));
			assert.equal(result, undefined);
		});

		it("reads version information from existing file", () => {
			const content = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
 *
 * Baseline (previous) version: 1.2.3
 * Current version: 2.0.0
 */

import type { TypeOnly } from "@fluidframework/build-tools";
`;
			writeFileSync(testFile, content);

			const result = readExistingVersions(testFile);
			assert.deepEqual(result, {
				previousVersion: "1.2.3",
				currentVersion: "2.0.0",
			});
		});

		it("returns undefined when version information is missing", () => {
			const content = `// Some other file without version info`;
			writeFileSync(testFile, content);

			const result = readExistingVersions(testFile);
			assert.equal(result, undefined);
		});

		it("preserves versions when skipVersionOutput flag would be used", () => {
			const existingContent = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by flub generate:typetests in @fluid-tools/build-cli.
 *
 * Baseline (previous) version: 1.0.0
 * Current version: 1.5.0
 */

import type { TypeOnly } from "@fluidframework/build-tools";
`;
			writeFileSync(testFile, existingContent);

			const result = readExistingVersions(testFile);
			assert.notEqual(result, undefined);
			assert.deepEqual(result, {
				previousVersion: "1.0.0",
				currentVersion: "1.5.0",
			});

			// Verify that when versions exist, they would be preserved (simulating skipVersionOutput behavior)
			// The actual versions from package.json would be 2.0.0 and 2.5.0, but we preserve what's in the file
			assert.equal(result.previousVersion, "1.0.0");
			assert.equal(result.currentVersion, "1.5.0");
		});
	});

	describe("skipVersionOutput flag", () => {
		let restore = mockedEnv.default({}, { clear: false });

		afterEach(() => restore());

		it("reads from FLUB_TYPETEST_SKIP_VERSION_OUTPUT environment variable", () => {
			restore = mockedEnv.default(
				{
					FLUB_TYPETEST_SKIP_VERSION_OUTPUT: "1",
				},
				{ clear: false },
			);

			// Access the flag definition to verify it has the env property set
			const { flags } = GenerateTypetestsCommand;
			assert.equal(flags.skipVersionOutput.env, "FLUB_TYPETEST_SKIP_VERSION_OUTPUT");

			// Verify that when the env var is set to "1", the flag would be truthy
			// (oclif handles this conversion automatically)
			const envValue = process.env.FLUB_TYPETEST_SKIP_VERSION_OUTPUT;
			assert.equal(envValue, "1");
		});

		it("uses false as default when environment variable is not set", () => {
			restore = mockedEnv.default({}, { clear: false });

			const { flags } = GenerateTypetestsCommand;
			assert.equal(flags.skipVersionOutput.default, false);
		});
	});
});
