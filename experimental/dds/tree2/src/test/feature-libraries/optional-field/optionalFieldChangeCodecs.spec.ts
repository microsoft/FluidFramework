/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { NodeChangeset } from "../../../feature-libraries";
import { JsonCompatibleReadOnly, brand } from "../../../util";
import { EncodingTestData, makeEncodingTestSuite } from "../../utils";
import {
	OptionalChangeset,
	makeOptionalFieldCodecFamily,
	optionalFieldEditor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field";
import { IJsonCodec } from "../../../codec";
import { changesetForChild } from "../fieldKindTestUtils";
import { RevisionTagCodec } from "../../../shared-tree-core";

const nodeChange1 = changesetForChild("nodeChange1");

const encodedChild = "encoded child";

const childCodec1: IJsonCodec<NodeChangeset> = {
	encode: (change: NodeChangeset) => {
		assert.deepEqual(change, nodeChange1);
		return encodedChild;
	},
	decode: (encodedChange: JsonCompatibleReadOnly) => {
		assert.equal(encodedChange, encodedChild);
		return nodeChange1;
	},
};

const change1: OptionalChangeset = {
	moves: [[{ localId: brand(41) }, "self", "nodeTargeting"]],
	childChanges: [],
	reservedDetachId: { localId: brand(1) },
};

const change2: OptionalChangeset = optionalFieldEditor.set(false, {
	fill: brand(42),
	detach: brand(2),
});

const change2Inverted: OptionalChangeset = {
	moves: [
		[{ localId: brand(2) }, "self", "nodeTargeting"],
		["self", { localId: brand(42) }, "cellTargeting"],
	],
	childChanges: [],
};

const changeWithChildChange = optionalFieldEditor.buildChildChange(0, nodeChange1);

const change1WithChildChange: OptionalChangeset = {
	moves: [
		[{ localId: brand(41) }, "self", "nodeTargeting"],
		["self", { localId: brand(1) }, "cellTargeting"],
	],
	childChanges: [["self", nodeChange1]],
};

describe("defaultFieldChangeCodecs", () => {
	describe("OptionalChangeset", () => {
		const encodingTestData: EncodingTestData<OptionalChangeset, unknown> = {
			successes: [
				["set from empty", change1],
				["set from non-empty", change2],
				["child change", changeWithChildChange],
				["field set with child change", change1WithChildChange], // Note: should only get sent over the wire when using transaction APIs.
				["undone field change", change2Inverted],
			],
		};

		makeEncodingTestSuite(
			makeOptionalFieldCodecFamily(childCodec1, new RevisionTagCodec()),
			encodingTestData,
		);
	});

	// TODO: test other kinds of changesets
});
