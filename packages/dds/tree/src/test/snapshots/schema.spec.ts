/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TObject, TString } from "typebox";

import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
import type { isAssignableTo, requireFalse, requireTrue } from "../../util/index.js";
import { testTrees } from "../testTrees.js";

import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";

describe("schema snapshots", () => {
	useSnapshotDirectory("schema-files");

	it("restricts snapshot inputs to JSON data and object schemas", () => {
		type Input = Parameters<typeof takeJsonSnapshot>[0];
		type _Json = requireTrue<isAssignableTo<{ value: string }, Input>>;
		type _Schema = requireTrue<isAssignableTo<TObject<{ value: TString }>, Input>>;
		type _Function = requireFalse<isAssignableTo<() => void, Input>>;
		type _BigInt = requireFalse<isAssignableTo<bigint, Input>>;
		type _Map = requireFalse<isAssignableTo<Map<string, string>, Input>>;
	});

	for (const schemaFormat of schemaCodecBuilder.registry) {
		for (const { name, schemaData } of testTrees) {
			it(`${name} - schema v${schemaFormat.formatVersion}`, () => {
				const encoded = schemaFormat
					.codec({ jsonValidator: FormatValidatorBasic })
					.encode(schemaData);
				takeJsonSnapshot(encoded);
			});
		}
	}
});
