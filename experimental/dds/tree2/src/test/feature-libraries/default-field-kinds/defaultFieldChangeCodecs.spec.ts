/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { NodeChangeset } from "../../../feature-libraries";
import { mintRevisionTag } from "../../../core";
import { JsonCompatibleReadOnly, brand } from "../../../util";
import { makeEncodingTestSuite } from "../../utils";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";
import { IJsonCodec } from "../../../codec";
// eslint-disable-next-line import/no-internal-modules
import { makeOptionalFieldCodecFamily } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeCodecs";
import { changeSetForChild, testTree, testTreeCursor } from "./fieldKindTestUtils";

const nodeChange1 = changeSetForChild("nodeChange1");

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
	fieldChange: {
		id: brand(1),
		newContent: { set: testTree("tree1"), changes: nodeChange1 },
		wasEmpty: true,
	},
};

const revertChange2: OptionalChangeset = {
	fieldChange: {
		id: brand(2),
		newContent: {
			revert: testTreeCursor("tree1"),
			changeId: { revision: mintRevisionTag(), localId: brand(2) },
		},
		wasEmpty: false,
	},
};

const change1WithChildChange: OptionalChangeset = {
	fieldChange: {
		newContent: { set: testTree("tree1"), changes: nodeChange1 },
		wasEmpty: false,
		id: brand(1),
		revision: mintRevisionTag(),
	},
};

describe("defaultFieldChangeCodecs", () => {
	describe("OptionalChangeset", () => {
		const encodingTestData: [string, OptionalChangeset][] = [
			["change", change1],
			["with child change", change1WithChildChange],
			["with repair data", revertChange2],
		];

		makeEncodingTestSuite(makeOptionalFieldCodecFamily(childCodec1), encodingTestData);
	});

	// TODO: test other kinds of changesets
});
