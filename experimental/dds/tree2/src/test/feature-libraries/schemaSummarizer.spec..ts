/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	encodeTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/schemaSummarizer";
import { storedEmptyFieldSchema } from "../../core";
import { jsonSequenceRootSchema } from "../utils";

describe("schemaSummarizer", () => {
	describe("encodeTreeSchema", () => {
		it("empty", () => {
			const encoded = encodeTreeSchema({
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});
			const snapshot = {
				rootFieldSchema: {
					kind: "Forbidden",
					types: [],
				},
				nodeSchema: [],
				version: "1.0.0",
			};
			assert.deepEqual(encoded, snapshot);
		});

		it("simple", () => {
			const encoded = encodeTreeSchema(jsonSequenceRootSchema);
			const snapshot = {
				rootFieldSchema: {
					kind: "Sequence",
					types: [
						"com.fluidframework.json.object",
						"com.fluidframework.json.array",
						"com.fluidframework.leaf.number",
						"com.fluidframework.leaf.boolean",
						"com.fluidframework.leaf.string",
						"com.fluidframework.leaf.null",
					],
				},
				nodeSchema: [
					{
						leafValue: undefined,
						mapFields: undefined,
						name: "com.fluidframework.json.array",
						objectNodeFields: [
							{
								kind: "Sequence",
								name: "",
								types: [
									"com.fluidframework.json.object",
									"com.fluidframework.json.array",
									"com.fluidframework.leaf.number",
									"com.fluidframework.leaf.boolean",
									"com.fluidframework.leaf.string",
									"com.fluidframework.leaf.null",
								],
							},
						],
					},
					{
						leafValue: undefined,
						mapFields: {
							kind: "Optional",
							types: [
								"com.fluidframework.json.object",
								"com.fluidframework.json.array",
								"com.fluidframework.leaf.number",
								"com.fluidframework.leaf.boolean",
								"com.fluidframework.leaf.string",
								"com.fluidframework.leaf.null",
							],
						},
						name: "com.fluidframework.json.object",
						objectNodeFields: [],
					},
					{
						leafValue: 2,
						mapFields: undefined,
						name: "com.fluidframework.leaf.boolean",
						objectNodeFields: [],
					},
					{
						leafValue: 3,
						mapFields: undefined,
						name: "com.fluidframework.leaf.handle",
						objectNodeFields: [],
					},
					{
						leafValue: 4,
						mapFields: undefined,
						name: "com.fluidframework.leaf.null",
						objectNodeFields: [],
					},
					{
						leafValue: 0,
						mapFields: undefined,
						name: "com.fluidframework.leaf.number",
						objectNodeFields: [],
					},
					{
						leafValue: 1,
						mapFields: undefined,
						name: "com.fluidframework.leaf.string",
						objectNodeFields: [],
					},
				],
				version: "1.0.0",
			};

			assert.deepEqual(encoded, snapshot);
		});
	});
});
