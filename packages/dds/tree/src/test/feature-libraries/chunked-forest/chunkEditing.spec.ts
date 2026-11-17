/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import type { TreeNodeSchemaIdentifier } from "../../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { BasicChunk } from "../../../feature-libraries/chunked-forest/basicChunk.js";
import {
	getFieldLength,
	isEditableChunk,
	locateNodeInChunks,
	validateChunkEditRange,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkEditing.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SequenceChunk } from "../../../feature-libraries/chunked-forest/sequenceChunk.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { numericBasicChunk, WrapperChunk } from "./fieldCursorTestUtilities.js";

/** Shape used to construct the uniform chunks in these tests. */
const numberShape = new TreeShape(
	brand<TreeNodeSchemaIdentifier>(numberSchema.identifier),
	true,
	[],
);

/**
 * Direct tests for chunkEditing's capability check, field lengths, index lookup, and range validation.
 * The editing interfaces are exercised through concrete adapters in chunkEditTraversal.spec.ts and uniformChunk.spec.ts.
 * Forest-level editing integration remains in chunkedForest.spec.ts.
 */
describe("chunkEditing", () => {
	describe("isEditableChunk", () => {
		it("distinguishes editable formats from a read-only wrapper", () => {
			const basic = numericBasicChunk(0);
			const chunks = [
				basic,
				new SequenceChunk([]),
				new UniformChunk(numberShape.withTopLevelLength(1), [1]),
			];
			for (const chunk of chunks) {
				assert.equal(isEditableChunk(chunk), true);
			}
			const readOnly = new WrapperChunk(basic);
			assert.equal(isEditableChunk(readOnly), false);
			readOnly.referenceRemoved();
			for (const chunk of chunks) {
				chunk.referenceRemoved();
			}
		});
	});

	describe("getFieldLength", () => {
		it("counts empty and mixed-format fields by logical nodes", () => {
			assert.equal(getFieldLength([]), 0);
			const chunks = [
				numericBasicChunk(0),
				new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]),
				new SequenceChunk([numericBasicChunk(4), new SequenceChunk([numericBasicChunk(5)])]),
			];
			assert.equal(getFieldLength(chunks), 6);
			for (const chunk of chunks) {
				chunk.referenceRemoved();
			}
		});
	});

	describe("validateChunkEditRange", () => {
		it("accepts empty, full, and end-of-field ranges", () => {
			for (const [start, end, length] of [
				[0, 0, 0],
				[0, 3, 3],
				[1, 1, 3],
				[3, 3, 3],
			]) {
				assert.doesNotThrow(() => validateChunkEditRange({ start, end }, length));
			}
		});

		for (const [name, start, end, length, message] of [
			["negative start", -1, 0, 3, "index must be non-negative"],
			["fractional start", 0.5, 1, 3, "index must be an integer"],
			["unsafe end", 0, Number.MAX_SAFE_INTEGER + 1, 3, "index must be an integer"],
			["negative end", 0, -1, 3, "index must be non-negative"],
			["reversed range", 2, 1, 3, "Edit range start must not exceed end"],
			["past end", 0, 4, 3, "Edit range must not exceed field length"],
		] as const) {
			it(`rejects ${name}`, () => {
				assert.throws(
					() => validateChunkEditRange({ start, end }, length),
					validateAssertionError(message),
				);
			});
		}
	});

	describe("locateNodeInChunks", () => {
		it("locates nodes by chunk index and offset", () => {
			const first = new BasicChunk(numberShape.type, new Map(), 0);
			const middle = new UniformChunk(numberShape.withTopLevelLength(3), [1, 2, 3]);
			const last = new BasicChunk(numberShape.type, new Map(), 4);
			const chunks = [first, middle, last];

			assert.deepEqual(locateNodeInChunks(chunks, 0), {
				chunk: first,
				indexOfChunk: 0,
				indexWithinChunk: 0,
			});
			assert.deepEqual(locateNodeInChunks(chunks, 1), {
				chunk: middle,
				indexOfChunk: 1,
				indexWithinChunk: 0,
			});
			assert.deepEqual(locateNodeInChunks(chunks, 3), {
				chunk: middle,
				indexOfChunk: 1,
				indexWithinChunk: 2,
			});
			assert.deepEqual(locateNodeInChunks(chunks, 4), {
				chunk: last,
				indexOfChunk: 2,
				indexWithinChunk: 0,
			});
		});

		it("rejects invalid node indices", () => {
			const chunks = [new BasicChunk(numberShape.type, new Map(), 0)];

			assert.throws(
				() => locateNodeInChunks(chunks, -1),
				validateAssertionError("index must be non-negative"),
			);
			for (const index of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => locateNodeInChunks(chunks, index),
					validateAssertionError("index must be an integer"),
				);
			}
			assert.throws(
				() => locateNodeInChunks(chunks, 1),
				validateAssertionError("missing edited node"),
			);
			assert.throws(
				() => locateNodeInChunks([], 0),
				validateAssertionError("Array index is out of bounds"),
			);
		});
	});
});
