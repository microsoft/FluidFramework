/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

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
	it("gives instructions for editing if an editing function name is supplied", () => {
		// If no editing function name is supplied, then the prompt shouldn't mention editing
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
			});
			assert.ok(!prompt.includes("### Editing"));
		}

		// If there is an editing function name supplied, then the prompt should describe how to edit the tree
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(prompt.includes("### Editing"));
			assert.ok(prompt.includes("testEditFunction"));
		}
	});

	it("includes the editing tool name if supplied", () => {
		// If no editing tool name is supplied, then the prompt shouldn't mention a tool
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(!prompt.includes('You must use the "'));
		}

		// If there is an editing tool name supplied, then the prompt should describe how to edit the tree
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "TestEditTool",
				editFunctionName: "testEditFunction",
			});
			assert.ok(prompt.includes("TestEditTool"));
		}
	});

	it("includes domain hints if supplied", () => {
		// If no domain hints, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
			});
			assert.ok(!prompt.includes("Domain-specific information"));
		}

		// If there are domain hints, then the prompt should include them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				domainHints: "These are some domain-specific hints.",
			});
			assert.ok(prompt.includes("These are some domain-specific hints."));
		}
	});

	it("acknowledges the presence of class methods if present", () => {
		// If no methods, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(!prompt.includes("ALWAYS prefer to use the application helper methods"));
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
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(prompt.includes("ALWAYS prefer to use the application helper methods"));
		}
	});

	it("acknowledges the presence of arrays in the schema if present", () => {
		// If no arrays, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(!prompt.includes("# Editing Arrays"));
		}
		// If there are arrays, then the prompt should mention them
		{
			const view = getView(
				sf.object("ObjectWithArray", {
					array: sf.array(sf.string),
				}),
				{ array: [] },
			);
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(prompt.includes("# Editing Arrays"));
		}
	});

	it("acknowledges the presence of maps in the schema if present", () => {
		// If no maps, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(!prompt.includes("# Editing Maps"));
		}
		// If there are maps, then the prompt should mention them
		{
			const view = getView(
				sf.object("ObjectWithMap", {
					map: sf.map(sf.string), // eslint-disable-line unicorn/no-array-callback-reference
				}),
				{ map: {} },
			);
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editFunctionName: "testEditFunction",
			});
			assert.ok(prompt.includes("# Editing Maps"));
		}
	});
});

describe("Prompt snapshot", () => {
	const updateSnapshots = false;

	it("with all options enabled", () => {
		class TestMap extends sf.map("TestMap", sf.number) {
			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					TestMap,
					"length",
					buildFunc({ returns: methods.instanceOf(NumberValue) }),
				);
			}

			public length(): NumberValue {
				return new NumberValue({ value: this.size });
			}
		}
		class NumberValue extends sf.object("TestArrayItem", { value: sf.number }) {
			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					NumberValue,
					"print",
					buildFunc({ returns: z.string() }, ["radix", z.number()]),
				);
			}

			public print(radix: number): string {
				return this.value.toString(radix);
			}
		}
		class TestArray extends sf.array("TestArray", NumberValue) {}
		class Obj extends sf.object("Obj", {
			map: TestMap,
			array: TestArray,
		}) {}

		const view = getView(Obj, {
			map: { a: 1 },
			array: [
				new NumberValue({ value: 1 }),
				new NumberValue({ value: 2 }),
				new NumberValue({ value: 3 }),
			],
		});

		const fullPrompt = getPrompt({
			subtree: new Subtree(view as TreeView<ImplicitFieldSchema>),
			editFunctionName: "editTree",
			editToolName: "EditTool",
			domainHints: "These are some domain-specific hints.",
		});

		const snapDir = "./src/test/__snapshots__";
		if (!fs.existsSync(snapDir)) {
			fs.mkdirSync(snapDir, { recursive: true });
		}
		const snapFile = path.join(snapDir, "prompt.md");

		// If the UPDATE_SNAPSHOTS environment variable is set, write/overwrite the snapshot.
		if (updateSnapshots) {
			fs.writeFileSync(snapFile, fullPrompt, "utf8");
			return;
		}

		// Otherwise, read the snapshot and compare.
		if (!fs.existsSync(snapFile)) {
			throw new Error(
				`Snapshot not found: ${snapFile}. Run the tests with updateSnapshots=true to create it.`,
			);
		}

		const expected = fs.readFileSync(snapFile, "utf8");
		assert.equal(fullPrompt, expected);
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
