/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { encodeTreeSchema } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { supportedSchemaFormats } from "../feature-libraries/schema-index/codecUtil.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const schemaFormat of supportedSchemaFormats) {
		for (const { name, schemaData } of testTrees) {
			it(`${name} - schema v${schemaFormat}`, () => {
				const encoded = encodeTreeSchema(schemaData, schemaFormat);
				takeJsonSnapshot(encoded);
			});
		}
	}
});
