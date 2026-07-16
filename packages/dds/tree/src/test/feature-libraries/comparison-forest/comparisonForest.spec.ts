/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { TreeStoredSchemaRepository } from "../../../core/index.js";
import {
	buildChunkedForest,
	ComparisonForest,
	assertForestsEqual,
	buildForest,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	makeTreeChunker,
} from "../../../feature-libraries/index.js";
import { Breakable } from "../../../util/index.js";
import { testForest } from "../../forestTestSuite.js";
import { initializeForest } from "../../feature-libraries/index.js";
import { fieldJsonCursor } from "../../json/index.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
import { testIdCompressor, testRevisionTagCodec } from "../../utils.js";

describe("ComparisonForest", () => {
	// Run the whole forest test suite against a ComparisonForest whose main forest is a ChunkedForest
	// and whose reference forest is an ObjectForest.
	// This validates that ChunkedForest's behavior matches the reference for every delta the suite applies.
	describe("forest suite (ChunkedForest main, ObjectForest reference)", () => {
		testForest({
			factory: (schema) =>
				new ComparisonForest(
					buildChunkedForest(
						makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
					),
					buildForest(new Breakable("ComparisonForest reference"), schema),
				),
			skipCursorErrorCheck: true,
		});
	});

	describe("assertForestsEqual", () => {
		it("does not throw when both forests have equal content", () => {
			const schema = new TreeStoredSchemaRepository(jsonSequenceRootSchema);
			const main = buildChunkedForest(
				makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
			);
			const reference = buildForest(new Breakable("reference"), schema);
			initializeForest(
				main,
				fieldJsonCursor([1, 2, 3]),
				testRevisionTagCodec,
				testIdCompressor,
			);
			initializeForest(
				reference,
				fieldJsonCursor([1, 2, 3]),
				testRevisionTagCodec,
				testIdCompressor,
			);

			assertForestsEqual(main, reference);
		});

		it("throws when the forests have different content", () => {
			const schema = new TreeStoredSchemaRepository(jsonSequenceRootSchema);
			const main = buildForest(new Breakable("main"), schema);
			const reference = buildForest(new Breakable("reference"), schema);
			initializeForest(
				main,
				fieldJsonCursor([1, 2, 3]),
				testRevisionTagCodec,
				testIdCompressor,
			);
			initializeForest(
				reference,
				fieldJsonCursor([1, 2, 4]),
				testRevisionTagCodec,
				testIdCompressor,
			);

			assert.throws(
				() => assertForestsEqual(main, reference),
				validateAssertionError(/Forests are not equal/),
			);
		});
	});

	it("delegates reads to the main forest and applies deltas to both forests", () => {
		const schema = new TreeStoredSchemaRepository(jsonSequenceRootSchema);
		const main = buildChunkedForest(
			makeTreeChunker(schema, defaultSchemaPolicy, defaultIncrementalEncodingPolicy),
		);
		const reference = buildForest(new Breakable("reference"), schema);
		const forest = new ComparisonForest(main, reference);

		assert.equal(forest.isEmpty, true);

		// Applying a delta (via initializeForest) exercises the ComparisonForest visitor, which applies to
		// both forests and asserts they remain equal when the visitor is freed.
		initializeForest(
			forest,
			fieldJsonCursor([1, 2, 3]),
			testRevisionTagCodec,
			testIdCompressor,
		);

		assert.equal(forest.isEmpty, false);
		assert.equal(main.isEmpty, false);
		assert.equal(reference.isEmpty, false);
		assertForestsEqual(main, reference);
	});
});
