/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IIdCompressor } from "@fluidframework/id-compressor";

import { extractJsonValidator } from "../../../codec/index.js";
import { detachedFieldIndexCodecBuilder, type RevisionTagCodec } from "../../../core/index.js";
import {
	DetachId,
	ForestRootIdSchema,
	// eslint-disable-next-line import-x/no-internal-modules -- Test the individual ID schemas.
} from "../../../core/tree/detachedFieldIndexFormatCommon.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
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

	it("formats", () => {
		snapshotCodecFormats(detachedFieldIndexCodecBuilder, {
			// These should not be used during build (just captured), so provide dummy values.
			idCompressor: null as unknown as IIdCompressor,
			revisionTagCodec: null as unknown as RevisionTagCodec,
		});
	});
});
