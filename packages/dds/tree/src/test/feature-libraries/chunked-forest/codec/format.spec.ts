/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { EncodedFieldBatch } from "../../../../feature-libraries/chunked-forest/codec/format.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../../snapshots/index.js";

describe("chunked-forest-format", () => {
	useSnapshotDirectory();

	it("EncodedFieldBatch", () => {
		// Capture the json schema for the format as a snapshot, so any change to what schema is allowed shows up in this tests.
		takeJsonSnapshot(EncodedFieldBatch);
	});
});
