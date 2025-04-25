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
import { JsonAsTree } from "../../../jsonDomainSchema.js";

describe("schemaSummarizer", () => {
	describe("encodeTreeSchema", () => {
		useSnapshotDirectory("encodeTreeSchema");
		for (const schemaFormatVersion of [1, 2]) {
			it(`empty FormatV${schemaFormatVersion}`, () => {
				const encoded = encodeTreeSchema(
					{
						rootFieldSchema: storedEmptyFieldSchema,
						nodeSchema: new Map(),
					},
					schemaFormatVersion,
				);
				takeJsonSnapshot(encoded);
			});

			it(`simple encoded schema FormatV${schemaFormatVersion}`, () => {
				const encoded = encodeTreeSchema(toStoredSchema(JsonAsTree.Tree), schemaFormatVersion);
				takeJsonSnapshot(encoded);
			});
		}
	});
});
