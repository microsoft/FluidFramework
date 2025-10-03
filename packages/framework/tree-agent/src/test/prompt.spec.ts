/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	independentView,
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
} from "@fluidframework/tree/internal";
import { z } from "zod";

import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../methodBinding.js";
import { getPrompt } from "../prompt.js";
import { Subtree } from "../subtree.js";
import type { TreeView } from "../utils.js";

const sf = new SchemaFactory("test");

describe("Prompt generation", () => {
	it("acknowledges the presence of class methods if present", () => {
		// If no methods, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			assert.ok(!prompt(view).includes("ALWAYS prefer to use the application helper methods"));
		}

		// If there are methods, then the prompt should mention them
		{
			class Obj extends sf.object("ArrayWithMethod", {}) {
				public method(s: string): boolean {
					return false;
				}

				public static [exposeMethodsSymbol](methods: ExposedMethods): void {
					methods.expose(
						Obj,
						"method",
						buildFunc({ returns: z.boolean() }, ["s", z.string()]),
					);
				}
			}

			const view = getView(Obj, {});
			assert.ok(prompt(view).includes("ALWAYS prefer to use the application helper methods"));
		}
	});

	it("acknowledges the presence of arrays in the schema if present", () => {
		// If no arrays, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			assert.ok(!prompt(view).includes("# Editing Arrays"));
		}
		// If there are arrays, then the prompt should mention them
		{
			const view = getView(
				sf.object("ObjectWithArray", {
					array: sf.array(sf.string),
				}),
				{ array: [] },
			);
			assert.ok(prompt(view).includes("# Editing Arrays"));
		}
	});

	it("acknowledges the presence of maps in the schema if present", () => {
		// If no maps, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			assert.ok(!prompt(view).includes("# Editing Maps"));
		}
		// If there are maps, then the prompt should mention them
		{
			const view = getView(
				sf.object("ObjectWithMap", {
					map: sf.map(sf.string), // eslint-disable-line unicorn/no-array-callback-reference
				}),
				{ map: {} },
			);
			assert.ok(prompt(view).includes("# Editing Maps"));
		}
	});
});

function getView<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: InsertableField<TSchema>,
): TreeView<TSchema> {
	const view = independentView(new TreeViewConfiguration({ schema }), {});
	view.initialize(initialTree);
	return view;
}

function prompt(view: TreeView<ImplicitFieldSchema>): string {
	return getPrompt({
		subtree: new Subtree(view),
		editingToolName: "",
		editingFunctionName: "",
	});
}
