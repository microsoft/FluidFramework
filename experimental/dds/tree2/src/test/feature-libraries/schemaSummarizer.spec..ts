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
				treeSchema: new Map(),
			});
			const snapshot = {};
			assert.deepEqual(encoded, snapshot);
		});
	});

	it("simple", () => {
		const encoded = encodeTreeSchema(jsonSequenceRootSchema);
		const snapshot = {};
		assert.deepEqual(encoded, snapshot);
	});
});
