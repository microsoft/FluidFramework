/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	encodeTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-index/schemaSummarizer";
import { storedEmptyFieldSchema } from "../../../core";
import { jsonSequenceRootSchema } from "../../utils";
import { intoStoredSchema } from "../../../feature-libraries";

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
			const encoded = encodeTreeSchema(intoStoredSchema(jsonSequenceRootSchema));
			const snapshot = {
				version: "1.0.0",
				nodeSchema: [
					{
						name: "com.fluidframework.json.array",
						data: {
							object: [
								{
									kind: "Sequence",
									types: [
										"com.fluidframework.json.object",
										"com.fluidframework.json.array",
										"com.fluidframework.leaf.number",
										"com.fluidframework.leaf.boolean",
										"com.fluidframework.leaf.string",
										"com.fluidframework.leaf.null",
									],
									name: "",
								},
							],
						},
					},
					{
						name: "com.fluidframework.json.object",
						data: {
							map: {
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
						},
					},
					{
						name: "com.fluidframework.leaf.boolean",
						data: {
							leaf: 2,
						},
					},
					{
						name: "com.fluidframework.leaf.handle",
						data: {
							leaf: 3,
						},
					},
					{
						name: "com.fluidframework.leaf.null",
						data: {
							leaf: 4,
						},
					},
					{
						name: "com.fluidframework.leaf.number",
						data: {
							leaf: 0,
						},
					},
					{
						name: "com.fluidframework.leaf.string",
						data: {
							leaf: 1,
						},
					},
				],
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
			};

			assert.deepEqual(encoded, snapshot);
		});
	});
});
