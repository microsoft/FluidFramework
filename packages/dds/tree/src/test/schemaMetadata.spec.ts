/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	SchemaFactory,
	TreeConfiguration,
	treeNodeApi,
	type TreeNode,
} from "../simple-tree/index.js";
import { TreeFactory } from "../treeFactory.js";

describe("Schema Metadata example patterns", () => {
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
			return JSON.stringify(input, (key: string | number, value: TreeNode) => {
				// Getting the field metadata requires looking up the parent and its schema
				const parent = treeNodeApi.parent(value);
				if (parent !== undefined) {
					const parentSchema = treeNodeApi.schema(parent);
					if ((parentSchema as any).fieldMetadata?.[key]?.aiIgnored === true) {
						return undefined;
					}
				}
				return value;
			});
		}

		const appConfig = new TreeConfiguration(Canvas, () => ({
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
		}));

		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const appView = tree.schematize(appConfig);

		const aiSummary = getAISummary(appView.root);
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
			return JSON.stringify(input, (key: string | number, value: TreeNode) => {
				const metadata = treeNodeApi.metadata(value) as AppSchemaMetadata;
				return metadata?.aiIgnored === true ? undefined : value;
			});
		}

		const canvas = new Canvas({
			width: 100,
			height: 200,
			notes: [
				new Note({
					position: { x: 10, y: 10 },
					width: 10,
					height: 20,
					text: "Hello",
				}),
				new Note({
					position: { x: 30, y: 10 },
					width: 30,
					height: 40,
					text: "World",
				}),
			],
		});

		const aiSummary = getAISummary(canvas);
		assert.equal(aiSummary, JSON.stringify({ notes: [{ text: "Hello" }, { text: "World" }] }));
	});
});
