/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	encodeTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-index/schemaSummarizer";
import { storedEmptyFieldSchema } from "../../../core";
import { jsonSequenceRootSchema } from "../../utils";
import { intoStoredSchema } from "../../../feature-libraries";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots";

describe("schemaSummarizer", () => {
	describe("encodeTreeSchema", () => {
		useSnapshotDirectory("encodeTreeSchema");
		it("empty", () => {
			const encoded = encodeTreeSchema({
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});
			takeJsonSnapshot(encoded);
		});

		it("simple encoded schema", () => {
			const encoded = encodeTreeSchema(intoStoredSchema(jsonSequenceRootSchema));
			takeJsonSnapshot(encoded);
		});
	});
});
