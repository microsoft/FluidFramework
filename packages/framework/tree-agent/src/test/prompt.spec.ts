/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	independentView,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
} from "@fluidframework/tree/internal";

import type { TreeView } from "../api.js";
import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../methodBinding.js";
import { getPrompt } from "../prompt.js";
import { exposePropertiesSymbol, type ExposedProperties } from "../propertyBinding.js";
import { Subtree } from "../subtree.js";
import { typeFactory as tf } from "../treeAgentTypes.js";

const sf = new SchemaFactoryAlpha("test");

describe("Prompt generation", () => {
	it("gives instructions for editing if an editing tool is supplied", () => {
		// If no editing function name is supplied, then the prompt shouldn't mention editing
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: undefined,
			});
			assert.ok(!prompt.includes("### Editing"));
		}

		// If there is an editing function name supplied, then the prompt should describe how to edit the tree
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "EditTreeTool",
			});
			assert.ok(prompt.includes("### Editing"));
			assert.ok(prompt.includes("EditTreeTool"));
		}
	});

	it("includes domain hints if supplied", () => {
		// If no domain hints, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: undefined,
			});
			assert.ok(!prompt.includes("Domain-specific information"));
		}

		// If there are domain hints, then the prompt should include them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: undefined,
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
				editToolName: "EditTreeTool",
			});
			assert.ok(!prompt.includes("ALWAYS prefer to use any application helper methods"));
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
						buildFunc({ returns: tf.boolean() }, ["s", tf.string()]),
					);
				}
			}

			const view = getView(Obj, {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "EditTreeTool",
			});
			assert.ok(prompt.includes("ALWAYS prefer to use any application helper methods"));
		}
	});

	it("acknowledges the presence of properties if present", () => {
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "EditTreeTool",
			});
			assert.ok(
				!prompt.includes(
					"Some schema types expose additional helper properties directly on the objects (including readonly properties).",
				),
			);
		}
		{
			class ObjWithProperty extends sf.object("ObjWithProperty", {}) {
				public readonly testProperty: string = "testProperty";
				public get name(): string {
					return this.testProperty;
				}

				public static [exposePropertiesSymbol](properties: ExposedProperties): void {
					properties.exposeProperty(ObjWithProperty, "name", {
						schema: tf.string(),
						readOnly: true,
					});
					properties.exposeProperty(ObjWithProperty, "testProperty", {
						schema: tf.string(),
						readOnly: true,
					});
				}
			}

			const view = getView(ObjWithProperty, {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "EditTreeTool",
			});
			assert.ok(prompt.includes("    readonly name: string;"));
			assert.ok(prompt.includes("    readonly testProperty: string;"));
		}
	});

	it("acknowledges the presence of arrays in the schema if present", () => {
		// If no arrays, then the prompt shouldn't mention them
		{
			const view = getView(sf.object("Object", {}), {});
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "EditTreeTool",
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
				editToolName: "EditTreeTool",
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
				editToolName: "EditTreeTool",
			});
			assert.ok(!prompt.includes("# Editing Maps"));
		}
		// If there are maps, then the prompt should mention them
		{
			const view = getView(
				sf.object("ObjectWithMap", {
					map: sf.map(sf.string),
				}),
				{ map: {} },
			);
			const prompt = getPrompt({
				subtree: new Subtree(view),
				editToolName: "EditTreeTool",
			});
			assert.ok(prompt.includes("# Editing Maps"));
		}
	});

	it("sanitizes schema names that contain invalid characters", () => {
		class InvalidlyNamedObject extends sf.object("Test-Object!", { value: sf.string }) {}

		const view = getView(InvalidlyNamedObject, { value: "test" });
		const prompt = getPrompt({
			subtree: new Subtree(view),
			editToolName: "EditTreeTool",
		});

		assert.ok(prompt.includes("Test_Object_"));
		assert.ok(
			!prompt.includes("Test-Object!"),
			"The unsanitized identifier should not show up in the prompt",
		);
	});

	it("sanitizes schema names that have leading digit", () => {
		class LeadingDigit extends sf.object("1TestObject", { value: sf.string }) {}

		const view = getView(LeadingDigit, { value: "test" });
		const prompt = getPrompt({
			subtree: new Subtree(view),
			editToolName: "EditTreeTool",
		});

		assert.ok(prompt.includes("_1TestObject"));
		assert.ok(
			!prompt.includes("test.1TestObject"),
			"The unsanitized identifier should not show up in the prompt",
		);
	});
});

describe("Prompt snapshot", () => {
	const updateSnapshots = false;

	it("does not update automatically", () => {
		// Prevent accidentally checking in `updateSnapshots = true`
		assert.equal(updateSnapshots, false);
	});

	it("with all options enabled", () => {
		class TestMap extends sf.mapAlpha("TestMap", sf.number, {
			metadata: { description: "A test map" },
		}) {
			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					TestMap,
					"processData",
					buildFunc(
						{
							returns: tf.promise(
								tf.object({
									summary: tf.intersection([
										tf.object({
											count: tf.number(),
											average: tf.number(),
										}),
										tf.object({
											timestamp: tf.date(),
										}),
									]),
									items: tf.array(tf.instanceOf(NumberValue)),
								}),
							),
							description:
								"Processes map data with a date range, filter function, and optional configuration",
						},
						["startDate", tf.date()],
						["endDate", tf.optional(tf.date())],
						["filter", tf.function([["value", tf.number()]], tf.boolean())],
						[
							"options",
							tf.optional(
								tf.object({
									mode: tf.union([tf.literal("sync"), tf.literal("async")]),
									includeMetadata: tf.boolean(),
								}),
							),
						],
					),
				);
			}

			public static [exposePropertiesSymbol](properties: ExposedProperties): void {
				properties.exposeProperty(TestMap, "metadata", {
					schema: tf.readonly(tf.record(tf.string(), tf.union([tf.string(), tf.number()]))),
					readOnly: true,
					description: "Readonly map metadata",
				});
			}

			public readonly metadata: Record<string, string | number> = { version: 1 };

			public async processData(
				_startDate: Date,
				_endDate?: Date,
				_filter?: (value: number) => boolean,
				_options?: { mode: "sync" | "async"; includeMetadata: boolean },
			): Promise<{
				summary: { count: number; average: number; timestamp: Date };
				items: NumberValue[];
			}> {
				return {
					summary: { count: this.size, average: 0, timestamp: new Date() },
					items: [],
				};
			}
		}
		class NumberValue extends sf.object("TestArrayItem", { value: sf.number }) {
			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					NumberValue,
					"formatValue",
					buildFunc(
						{
							returns: tf.promise(tf.string()),
							description: "Formats the number value with optional configuration",
						},
						["radix", tf.number()],
						["formatter", tf.optional(tf.function([["n", tf.number()]], tf.string()))],
					),
				);
			}
			public static [exposePropertiesSymbol](properties: ExposedProperties): void {
				properties.exposeProperty(NumberValue, "metadata", {
					schema: tf.object({
						id: tf.string(),
						tags: tf.array(tf.string()),
					}),
					readOnly: true,
				});
			}

			public readonly metadata = { id: "item", tags: [] as string[] };

			public async formatValue(
				radix: number,
				formatter?: (n: number) => string,
			): Promise<string> {
				if (formatter) {
					return formatter(this.value);
				}
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
			editToolName: "EditTreeTool",
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
	const view = independentView(new TreeViewConfiguration({ schema }));
	view.initialize(initialTree);
	return view;
}
