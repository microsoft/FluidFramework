/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import { detachedFieldIndexCodecBuilder, type RevisionTagCodec } from "../../../core/index.js";
import { snapshotCodecFormats, useSnapshotDirectory } from "../../snapshots/index.js";

describe("detachedFieldIndexCodec", () => {
	useSnapshotDirectory("codecFormats");
	it("formats", () => {
		snapshotCodecFormats(detachedFieldIndexCodecBuilder, {
			// These should not be used during build (just captured), so provide dummy values.
			idCompressor: null as unknown as IIdCompressor,
			revisionTagCodec: null as unknown as RevisionTagCodec,
		});
	});
});
