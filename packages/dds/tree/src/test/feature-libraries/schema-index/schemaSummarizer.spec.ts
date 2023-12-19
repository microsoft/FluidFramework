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
				root: {
					kind: "Forbidden",
					types: [],
				},
				nodes: Object.create(null),
				version: 1,
			};
			assert.deepEqual(encoded, snapshot);
		});

		it("simple", () => {
			const encoded = encodeTreeSchema(intoStoredSchema(jsonSequenceRootSchema));
			const snapshot = {
				version: 1,
				nodes: Object.assign(Object.create(null), {
					"com.fluidframework.json.array": {
						object: Object.assign(Object.create(null), {
							"": {
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
						}),
					},
					"com.fluidframework.json.object": {
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
					"com.fluidframework.leaf.boolean": {
						leaf: 2,
					},
					"com.fluidframework.leaf.handle": {
						leaf: 3,
					},
					"com.fluidframework.leaf.null": {
						leaf: 4,
					},
					"com.fluidframework.leaf.number": {
						leaf: 0,
					},
					"com.fluidframework.leaf.string": {
						leaf: 1,
					},
				}),
				root: {
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
