/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { TypeData } from "@fluidframework/build-tools";
import {
	loadTypesSourceFile,
	typeDataFromFile,
} from "../../../src/commands/generate/typetests.js";

describe("generate:typetests", () => {
	const logger = {
		log: () => assert.fail(),
		info: () => assert.fail(),
		warning: () => assert.fail(),
		errorLog: () => assert.fail(),
		verbose: () => assert.fail(),
		logHr: () => assert.fail(),
		logIndent: () => assert.fail(),
	};

	function forCompare(data: Map<string, TypeData>): unknown[] {
		return [...data.entries()].map(([k, v]) => ({
			name: k,
			import: v.name,
			tags: [...v.tags],
		}));
	}

	// Test a file which looks like a rollup: a file that reexports content from other files.
	it("rollup", () => {
		const currentFile = loadTypesSourceFile("./test/data/exports/exports-rollup.d.ts");

		const types = forCompare(typeDataFromFile(currentFile, logger));
		assert.deepEqual(types, [
			{ name: "TypeAliasDeclaration_A", import: "A", tags: ["public"] },
			{ name: "VariableDeclaration_b", import: "b", tags: ["public"] },
			{ name: "VariableDeclaration_c", import: "c", tags: ["internal"] },
			{
				name: "TypeAliasDeclaration_InternalTypes_Inner",
				import: "InternalTypes.Inner",
				tags: ["public"],
			},
			{
				name: "TypeAliasDeclaration_InternalTypes_InnerInternal",
				import: "InternalTypes.InnerInternal",
				tags: ["internal"],
			},
			{ name: "TypeAliasDeclaration_OtherA", import: "OtherA", tags: ["public"] },
			{ name: "TypeAliasDeclaration_OtherA2", import: "OtherA2", tags: ["public"] },
		]);
	});

	// Test a file which directly includes several kinds of exports to ensure that various export types work correctly.
	it("direct", () => {
		const currentFile = loadTypesSourceFile("./test/data/exports/exports.d.ts");

		const types = forCompare(typeDataFromFile(currentFile, logger));
		assert.deepEqual(types, [
			{ name: "TypeAliasDeclaration_A", import: "A", tags: ["public"] },
			{ name: "VariableDeclaration_a", import: "a", tags: ["public"] },
			{ name: "VariableDeclaration_b", import: "b", tags: ["public"] },
			{ name: "VariableDeclaration_c", import: "c", tags: ["internal"] },
			{
				name: "TypeAliasDeclaration_InternalTypes_Inner",
				import: "InternalTypes.Inner",
				tags: ["public"],
			},
			{
				name: "TypeAliasDeclaration_InternalTypes_InnerInternal",
				import: "InternalTypes.InnerInternal",
				tags: ["internal"],
			},
		]);
	});
});
