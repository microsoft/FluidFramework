/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { encodeTreeSchema, intoStoredSchema } from "../../feature-libraries";
import { testTrees } from "../testTrees";
import { takeJsonSnapshot, useTestDirectory } from "./snapshotTools";

describe("schema snapshots", () => {
	useTestDirectory("schema-files");

	for (const { name, schemaData } of testTrees) {
		it(name, () => {
			const encoded = encodeTreeSchema(intoStoredSchema(schemaData));
			takeJsonSnapshot(encoded);
		});
	}
});
