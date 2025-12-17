/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	for (const [minVersionForCollab, schemaFormat] of schemaCodecBuilder.registry) {
		for (const { name, schemaData } of testTrees) {
			it(`${name} - schema v${schemaFormat.formatVersion}`, () => {
				const encoded = schemaFormat
					.codec({ jsonValidator: FormatValidatorBasic, minVersionForCollab })
					.encode(schemaData);
				takeJsonSnapshot(encoded);
			});
		}
	}
});
