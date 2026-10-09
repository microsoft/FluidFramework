/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { TNumber, TString } from "typebox";

import {
	detachedFieldIndexCodecBuilder,
	type ForestRootId,
	type RevisionTagCodec,
} from "../../../core/index.js";
import type {
	DetachedFieldIndexFormatVersion,
	EncodedRootsForRevision,
	Format,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../core/tree/detachedFieldIndexFormatCommon.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";
import { snapshotCodecFormats, useSnapshotDirectory } from "../../snapshots/index.js";

describe("detachedFieldIndexCodec", () => {
	useSnapshotDirectory("codecFormats");
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
