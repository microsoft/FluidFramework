/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const schemaFormat of schemaCodecBuilder.registry) {
		for (const { name, schemaData } of testTrees) {
			it(`${name} - schema v${schemaFormat.formatVersion}`, () => {
				assert(schemaFormat.minVersionForCollab !== "none");
				const encoded = schemaFormat
					.codec({
						jsonValidator: FormatValidatorBasic,
						minVersionForCollab: schemaFormat.minVersionForCollab,
					})
					.encode(schemaData);
				takeJsonSnapshot(encoded);
			});
		}
	}
});
