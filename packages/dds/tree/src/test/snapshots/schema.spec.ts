/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { encodeTreeSchema, intoStoredSchema } from "../../feature-libraries";
import { testTrees } from "../testTrees";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const { name, schemaData } of testTrees) {
		it(name, () => {
			const encoded = encodeTreeSchema(intoStoredSchema(schemaData));
			takeJsonSnapshot(encoded);
		});
	}
});
