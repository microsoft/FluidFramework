/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFormatVersion } from "../../core/index.js";
import { encodeTreeSchema } from "../../feature-libraries/index.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const { name, schemaData } of testTrees) {
		it(name, () => {
			const encoded = encodeTreeSchema(schemaData, SchemaFormatVersion.V2);
			takeJsonSnapshot(encoded);
		});
	}
});
