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
import { supportedSchemaFormats } from "./codecUtil.js";

describe("schemaSummarizer", () => {
	describe("encodeTreeSchema", () => {
		useSnapshotDirectory("encodeTreeSchema");
		for (const schemaFormat of supportedSchemaFormats) {
			it(`empty - schema v${schemaFormat}`, () => {
				const encoded = encodeTreeSchema(
					{
						rootFieldSchema: storedEmptyFieldSchema,
						nodeSchema: new Map(),
					},
					schemaFormat,
				);
				takeJsonSnapshot(encoded);
			});

			it(`simple encoded schema - schema v${schemaFormat}`, () => {
				const encoded = encodeTreeSchema(toStoredSchema(JsonAsTree.Tree), schemaFormat);
				takeJsonSnapshot(encoded);
			});
		}
	});
});
