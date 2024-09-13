/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import {
	isTreeNode,
	SchemaFactory,
	treeNodeApi,
	type TreeNode,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "./simple-tree/utils.js";
import { isTreeValue } from "../feature-libraries/index.js";

describe.only("Schema Metadata example patterns", () => {
	// TODO: docs
	describe("AI Summary example", () => {
		it("Status Quo - suggested patterns only", () => {
			const schemaFactory = new SchemaFactory("CanvasApp");

			interface AppSchemaMetadata {
				// Whether or not the associated field should be included in the AI summary.
				aiIgnored?: boolean;
			}

			class Point extends schemaFactory.object("Point", {
				x: schemaFactory.number,
				y: schemaFactory.number,
			}) {}

			class Note extends schemaFactory.object("Note", {
				position: Point,
				width: schemaFactory.number,
				height: schemaFactory.number,
				text: schemaFactory.string,
			}) {
				public static fieldMetadata: Record<string, AppSchemaMetadata> = {
					position: { aiIgnored: true },
					width: { aiIgnored: true },
					height: { aiIgnored: true },
					text: { aiIgnored: false },
				};
			}

			class Canvas extends schemaFactory.object("Canvas", {
				width: schemaFactory.number,
				height: schemaFactory.number,
				notes: schemaFactory.array(Note),
			}) {
				public static fieldMetadata: Record<string, AppSchemaMetadata> = {
					width: { aiIgnored: true },
					height: { aiIgnored: true },
					notes: { aiIgnored: false },
				};
			}

			function getAISummary(input: TreeNode): string {
				return JSON.stringify(
					input,
					function (this: unknown, key: string | number, value: unknown) {
						// Replacer function will also pass the original input node back in with a bogus "this" parent object.
						// If we encounter the original input, return it as as.
						if (value === input) {
							return value;
						}

						// If the parent isn't a TreeNode, then it is some other kind of object that can appear in a proxy,
						// e.g. an array. Return it as is.
						if (!isTreeNode(this)) {
							return value;
						}

						const schema = treeNodeApi.schema(this);
						// Omit the field if its metadata denotes it as AI-ignored
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						return (schema as any).fieldMetadata?.[key]?.aiIgnored === true
							? undefined
							: value;
					},
				);
			}

			const tree = hydrate(Canvas, {
				width: 100,
				height: 200,
				notes: [
					{
						position: { x: 10, y: 10 },
						width: 10,
						height: 20,
						text: "Hello",
					},
					{
						position: { x: 30, y: 10 },
						width: 30,
						height: 40,
						text: "World",
					},
				],
			});

			const aiSummary = getAISummary(tree);
			assert.equal(
				aiSummary,
				JSON.stringify({ notes: [{ text: "Hello" }, { text: "World" }] }),
			);
		});

		it("Custom Field Metadata", () => {
			const schemaFactory = new SchemaFactory("CanvasApp");

			interface AppSchemaMetadata {
				aiIgnored?: boolean;
			}

			class Point extends schemaFactory.object("Point", {
				x: schemaFactory.number,
				y: schemaFactory.number,
			}) {}

			class Note extends schemaFactory.object("Note", {
				position: schemaFactory.required(Point, { metadata: { aiIgnored: true } }),
				width: schemaFactory.required(schemaFactory.number, {
					metadata: { aiIgnored: true },
				}),
				height: schemaFactory.required(schemaFactory.number, {
					metadata: { aiIgnored: true },
				}),
				text: schemaFactory.string,
			}) {}

			class Canvas extends schemaFactory.object("Canvas", {
				width: schemaFactory.required(schemaFactory.number, {
					metadata: { aiIgnored: true },
				}),
				height: schemaFactory.required(schemaFactory.number, {
					metadata: { aiIgnored: true },
				}),
				notes: schemaFactory.array(Note),
			}) {}

			function getAISummary(input: TreeNode): string {
				return JSON.stringify(
					input,
					function (this: unknown, key: string | number, value: unknown) {
						// Replacer function will also pass the original input node back in with a bogus "this" parent object.
						// If we encounter the original input, return it as as.
						if (value === input) {
							return value;
						}

						// Note: app schema does not include maps, so we don't need to special case them here.

						// If the parent isn't a TreeNode, then it is some other kind of object that can appear in a proxy,
						// e.g. an array. Return it as is.
						if (!isTreeNode(this)) {
							return value;
						}

						const metadata = treeNodeApi.fieldMetadata(this, key) as AppSchemaMetadata;
						// Omit the field if its metadata denotes it as AI-ignored
						return metadata?.aiIgnored === true ? undefined : value;
					},
				);
			}

			const tree = hydrate(Canvas, {
				width: 100,
				height: 200,
				notes: [
					{
						position: { x: 10, y: 10 },
						width: 10,
						height: 20,
						text: "Hello",
					},
					{
						position: { x: 30, y: 10 },
						width: 30,
						height: 40,
						text: "World",
					},
				],
			});

			const aiSummary = getAISummary(tree);
			assert.equal(
				aiSummary,
				JSON.stringify({ notes: [{ text: "Hello" }, { text: "World" }] }),
			);
		});
	});

	// TODO: docs
	it("Type-narrowing example", () => {
		const schemaFactory = new SchemaFactory("CanvasApp");

		enum NumberType {
			Integer = "integer",
			Float = "float",
		}

		interface AppSchemaMetadata {
			numberType?: NumberType;
		}

		class Point extends schemaFactory.object("Point", {
			x: schemaFactory.required(schemaFactory.number, {
				metadata: { numberType: NumberType.Integer },
			}),
			y: schemaFactory.required(schemaFactory.number, {
				metadata: { numberType: NumberType.Integer },
			}),
		}) {}

		class Note extends schemaFactory.object("Note", {
			position: schemaFactory.required(Point, {
				metadata: {
					description: "The top-left corner of the note.",
				},
			}),
			width: schemaFactory.required(schemaFactory.number, {
				metadata: { numberType: NumberType.Float },
			}),
			height: schemaFactory.required(schemaFactory.number, {
				metadata: { numberType: NumberType.Float },
			}),
			text: schemaFactory.string,
		}) {}

		class Canvas extends schemaFactory.object("Canvas", {
			width: schemaFactory.required(schemaFactory.number, {
				metadata: { numberType: NumberType.Float },
			}),
			height: schemaFactory.required(schemaFactory.number, {
				metadata: { numberType: NumberType.Float },
			}),
			notes: schemaFactory.array(Note),
		}) {}

		function toDbJson(input: TreeNode): string {
			return JSON.stringify(
				input,
				function (this: unknown, key: string | number, value: unknown) {
					// Replacer function will also pass the original input node back in with a bogus "this" parent object.
					// If we encounter the original input, return it as as.
					if (value === input) {
						return value;
					}

					// Note: app schema does not include maps, so we don't need to special case them here.

					// If the parent isn't a TreeNode, then it is some other kind of object that can appear in a proxy,
					// e.g. an array. Return it as is.
					if (!isTreeNode(this)) {
						return value;
					}

					// If the field isn't a leaf node, then there is nothing special we need to do.
					// Return it as is.
					if (!isTreeValue(value)) {
						return value;
					}

					// Note: this doesn't handle FluidHandles correctly.

					const metadata = treeNodeApi.fieldMetadata(this, key) as AppSchemaMetadata;

					let type: string = typeof value;
					if (type === "number") {
						type = metadata?.numberType ?? NumberType.Float;
					}

					return { type, value };
				},
			);
		}

		const tree = hydrate(Canvas, {
			width: 100,
			height: 200,
			notes: [
				{
					position: { x: 10, y: 10 },
					width: 10,
					height: 20,
					text: "Hello",
				},
				{
					position: { x: 30, y: 10 },
					width: 30,
					height: 40,
					text: "World",
				},
			],
		});

		const expected = JSON.stringify({
			width: { type: "float", value: 100 },
			height: { type: "float", value: 200 },
			notes: [
				{
					position: {
						x: { type: "integer", value: 10 },
						y: { type: "integer", value: 10 },
					},
					width: { type: "float", value: 10 },
					height: { type: "float", value: 20 },
					text: { type: "string", value: "Hello" },
				},
				{
					position: {
						x: { type: "integer", value: 30 },
						y: { type: "integer", value: 10 },
					},
					width: { type: "float", value: 30 },
					height: { type: "float", value: 40 },
					text: { type: "string", value: "World" },
				},
			],
		});

		const result = toDbJson(tree);
		assert.equal(result, expected);
	});
});
