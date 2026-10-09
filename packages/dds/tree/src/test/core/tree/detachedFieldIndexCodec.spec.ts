/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { TNumber, TString } from "typebox";

import {
	detachedFieldIndexCodecBuilder,
	type ForestRootId,
	type RevisionTagCodec,
} from "../../../core/index.js";
import { extractJsonValidator } from "../../../codec/index.js";
import {
	DetachId,
	ForestRootIdSchema,
	type DetachedFieldIndexFormatVersion,
	type EncodedRootsForRevision,
	type Format,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../core/tree/detachedFieldIndexFormatCommon.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";
import { snapshotCodecFormats, useSnapshotDirectory } from "../../snapshots/index.js";

describe("detachedFieldIndexCodec", () => {
	useSnapshotDirectory("codecFormats");
	it("requires integral IDs while preserving their bounds", () => {
		const validator = extractJsonValidator(FormatValidatorBasic);
		const detach = validator.compile(DetachId);
		const root = validator.compile(ForestRootIdSchema);
		for (const value of [-1, 0, 1, Number.MAX_SAFE_INTEGER]) {
			assert.equal(detach.check(value), true);
			assert.equal(root.check(value), true);
		}
		assert.equal(detach.check(-2), true);
		assert.equal(root.check(-2), false);
		for (const value of [1e-11, 1 - 1e-11, 1 + 1e-11, -1 - 1e-11, 0.5]) {
			assert.equal(detach.check(value), false);
			assert.equal(root.check(value), false);
		}
	});

	it("preserves revision and version types in format aliases", () => {
		type _StringRoots = requireTrue<
			areSafelyAssignable<
				EncodedRootsForRevision<TString>,
				[string, [number, ForestRootId][]] | [string, number, ForestRootId]
			>
		>;
		type _NumberRoots = requireTrue<
			areSafelyAssignable<
				EncodedRootsForRevision<TNumber>,
				[number, [number, ForestRootId][]] | [number, number, ForestRootId]
			>
		>;
		type _StringFormat = requireTrue<
			areSafelyAssignable<
				Format<typeof DetachedFieldIndexFormatVersion.v1, TString>,
				{
					version: typeof DetachedFieldIndexFormatVersion.v1;
					data: EncodedRootsForRevision<TString>[];
					maxId: ForestRootId;
				}
			>
		>;
		type _NumberFormat = requireTrue<
			areSafelyAssignable<
				Format<typeof DetachedFieldIndexFormatVersion.v2, TNumber>,
				{
					version: typeof DetachedFieldIndexFormatVersion.v2;
					data: EncodedRootsForRevision<TNumber>[];
					maxId: ForestRootId;
				}
			>
		>;
	});

	it("formats", () => {
		snapshotCodecFormats(detachedFieldIndexCodecBuilder, {
			// These should not be used during build (just captured), so provide dummy values.
			idCompressor: null as unknown as IIdCompressor,
			revisionTagCodec: null as unknown as RevisionTagCodec,
		});
	});
});
