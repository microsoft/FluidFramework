/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, describe, it } from "vitest";

import {
	loadTypesSourceFile,
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
		]);
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
});
