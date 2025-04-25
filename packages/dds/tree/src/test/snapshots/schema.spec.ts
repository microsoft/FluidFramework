/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "node:assert";
import { encodeTreeSchema } from "../../feature-libraries/index.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const { name, schemaData, formatVersion } of testTrees) {
		it(name, () => {
			const version = formatVersion ?? fail("formatVersion must be set.");
			// TODO: Make encodeTreeSchema take an unconstrained number or constrain the type in the test.
			const encoded = encodeTreeSchema(schemaData, version as 1 | 2);
			takeJsonSnapshot(encoded);
		});
	}
});
