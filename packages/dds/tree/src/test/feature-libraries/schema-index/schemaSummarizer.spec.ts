/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { storedEmptyFieldSchema } from "../../../core/index.js";
import {
	encodeTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-index/schemaSummarizer.js";
import { toStoredSchema } from "../../../simple-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { JsonUnion } from "../../../jsonDomainSchema.js";

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
			const encoded = encodeTreeSchema(toStoredSchema(JsonUnion));
			takeJsonSnapshot(encoded);
		});
	});
});
