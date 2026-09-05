/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FormatValidatorBasic } from "../../external-utilities/index.js";
import { type LibraryId, SchemaFormatVersion } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const schemaFormat of schemaCodecBuilder.registry) {
		for (const { name, schemaData } of testTrees) {
			it(`${name} - schema v${schemaFormat.formatVersion}`, () => {
				const schema =
					schemaFormat.formatVersion === SchemaFormatVersion.v3Experimental
						? {
								...schemaData,
								schemaVersion: { ["com.fluidframework.test" as LibraryId]: 1 },
							}
						: schemaData;
				const encoded = schemaFormat
					.codec({ jsonValidator: FormatValidatorBasic })
					.encode(schema);
				takeJsonSnapshot(encoded);
			});
		}
	}
});
