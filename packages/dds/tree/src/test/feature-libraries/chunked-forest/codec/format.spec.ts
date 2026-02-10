/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Union } from "@sinclair/typebox";

import {
	EncodedFieldBatchV1,
	EncodedFieldBatchV2,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/format.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../../snapshots/index.js";

describe("chunked-forest-format", () => {
	useSnapshotDirectory();

	it("EncodedFieldBatch", () => {
		// Capture the json schema for the format as a snapshot, so any change to what schema is allowed shows up in this tests.
		// TODO: ClientVersionDispatchingCodecBuilder should provide a friendly way to snapshot all its codecs.
		takeJsonSnapshot(Union([EncodedFieldBatchV1, EncodedFieldBatchV2]));
	});
});
