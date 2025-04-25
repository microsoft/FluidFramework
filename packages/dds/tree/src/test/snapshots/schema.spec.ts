/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { encodeTreeSchema } from "../../feature-libraries/index.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const schemaFormatVersion of [1, 2]) {
		for (const { name, schemaData } of testTrees) {
			it(`${name} FormatV${schemaFormatVersion}`, () => {
				const encoded = encodeTreeSchema(schemaData, schemaFormatVersion);
				takeJsonSnapshot(encoded);
			});
		}
	}
});
