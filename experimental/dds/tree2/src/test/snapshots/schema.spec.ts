/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";
import { encodeTreeSchema, intoStoredSchema } from "../../feature-libraries";
import { testTrees as schemaTestTrees } from "../testTrees";
import {
	createSchemaSnapshot,
	dirPathTail,
	regenTestDirectory,
	regenerateSnapshots,
	verifyEqualPastSchemaSnapshot,
} from "./utils";

const schemaDirPath = path.join(__dirname, `../../../${dirPathTail}/schema-files`);

function getSchemaFilepath(name: string): string {
	return path.join(schemaDirPath, `${name}.json`);
}

describe("schema snapshots", () => {
	if (regenerateSnapshots) {
		regenTestDirectory(schemaDirPath);
	}

	for (const { name, schemaData } of schemaTestTrees) {
		it(`${regenerateSnapshots ? "regenerate " : ""}for ${name}`, async () => {
			const encoded = encodeTreeSchema(intoStoredSchema(schemaData));

			// eslint-disable-next-line unicorn/prefer-ternary
			if (regenerateSnapshots) {
				await createSchemaSnapshot(getSchemaFilepath(name), encoded);
			} else {
				await verifyEqualPastSchemaSnapshot(getSchemaFilepath(name), encoded, name);
			}
		});
	}
});
