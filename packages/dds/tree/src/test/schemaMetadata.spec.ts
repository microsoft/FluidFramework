/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SchemaFactory, treeNodeApi, TreeNode } from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "./simple-tree/utils.js";

describe.only("Schema Metadata example patterns", () => {
	it("Status Quo - suggested patterns only", () => {
		const schemaFactory = new SchemaFactory("Notes");

		interface AppSchemaMetadata {
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
					if (!(this instanceof TreeNode)) {
						return value;
					}

					const schema = treeNodeApi.schema(this);
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
		assert.equal(aiSummary, JSON.stringify({ notes: [{ text: "Hello" }, { text: "World" }] }));
	});

	it("Custom Field Metadata", () => {
		const schemaFactory = new SchemaFactory("Notes");

		interface AppSchemaMetadata {
			aiIgnored?: boolean;
		}

		class Point extends schemaFactory.object("Point", {
			x: schemaFactory.number,
			y: schemaFactory.number,
		}) {}

		class Note extends schemaFactory.object("Note", {
			position: schemaFactory.required(Point, { metadata: { aiIgnored: true } }),
			width: schemaFactory.required(schemaFactory.number, { metadata: { aiIgnored: true } }),
			height: schemaFactory.required(schemaFactory.number, { metadata: { aiIgnored: true } }),
			text: schemaFactory.string,
		}) {}

		class Canvas extends schemaFactory.object("Canvas", {
			width: schemaFactory.required(schemaFactory.number, { metadata: { aiIgnored: true } }),
			height: schemaFactory.required(schemaFactory.number, { metadata: { aiIgnored: true } }),
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

					// If the parent isn't a TreeNode, then it is some other kind of object that can appear in a proxy,
					// e.g. an array. Return it as is.
					if (!(this instanceof TreeNode)) {
						return value;
					}

					const metadata = treeNodeApi.metadata(this, key) as AppSchemaMetadata;
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
		assert.equal(aiSummary, JSON.stringify({ notes: [{ text: "Hello" }, { text: "World" }] }));
	});
});
