/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SessionId } from "@fluidframework/id-compressor";
import {
	type FieldChangeEncodingContext,
	SequenceField as SF,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { Changeset } from "../../../feature-libraries/sequence-field/index.js";
import { brand, type JsonCompatibleReadOnly } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import {
	type EncodingTestData,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";
import { TestNodeId } from "../../testNodeId.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { ChangeMaker as Change, cases, MarkMaker as Mark } from "./testEdits.js";
import { assertChangesetsEqual, inlineRevision } from "./utils.js";
import { withSchemaValidation } from "../../../codec/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";

type TestCase = [string, Changeset, FieldChangeEncodingContext];

const tag1 = mintRevisionTag();
const tag2 = mintRevisionTag();
const baseContext = {
	originatorId: "session1" as SessionId,
	revision: tag1,
	idCompressor: testIdCompressor,
};
const encodedTag1 = testRevisionTagCodec.encode(tag1);
const encodedTag2 = testRevisionTagCodec.encode(tag2);
const context: FieldChangeEncodingContext = {
	baseContext,
	encodeNode: (node) => TestNodeId.encode(node, baseContext),
	decodeNode: (node) => TestNodeId.decode(node, baseContext),
};

const changes = TestNodeId.create({ localId: brand(2) }, TestChange.mint([], 1));

const encodingTestData: EncodingTestData<Changeset, unknown, FieldChangeEncodingContext> = {
	successes: [
		["with child change", inlineRevision(Change.modify(1, changes), tag1), context],
		["without child change", inlineRevision(Change.remove(2, 2, tag1), tag1), context],
		[
			"with a revive",
			inlineRevision(Change.revive(0, 1, { revision: tag2, localId: brand(10) }, tag1), tag1),
			context,
		],
		...Object.entries(cases).map<TestCase>(([name, change]) => [
			name,
			inlineRevision(change, tag1),
			context,
		]),
		...generatePopulatedMarks(testIdCompressor).map<TestCase>((mark) => [
			"type" in mark ? mark.type : "NoOp",
			inlineRevision([mark], tag1),
			context,
		]),
	],
};

export function testCodecs() {
	describe("Codecs", () => {
		const sequenceFieldCodec = SF.sequenceFieldChangeCodecFactory(testRevisionTagCodec);
		makeEncodingTestSuite(sequenceFieldCodec, encodingTestData);
		describe("Rename-like AttachAndDetach from documents prior to 2024-07-23 are decoded as Rename", () => {
			const expected = [
				Mark.rename(
					1,
					{ revision: tag1, localId: brand(1) },
					{ revision: tag2, localId: brand(2) },
					{ changes },
				),
			];
			for (const { version, changeset } of renameLikeAttachAndDetach) {
				it(`version ${version}`, () => {
					const codec = sequenceFieldCodec.resolve(version);
					const jsonCodec =
						codec.json.encodedSchema !== undefined
							? withSchemaValidation(codec.json.encodedSchema, codec.json, typeboxValidator)
							: codec.json;
					const actual = jsonCodec.decode(changeset, context);
					assertChangesetsEqual(actual, expected);
				});
			}
		});
	});
}

/**
 * The pre-2024-07-23 JSON encodings for a changeset with a Rename-like AttachAndDetach mark.
 * This is used to ensure that later implementations of the codecs for the same versions can decode these changesets correctly.
 */
const renameLikeAttachAndDetach: readonly {
	readonly version: number;
	readonly changeset: JsonCompatibleReadOnly;
}[] = [
	{
		version: 1,
		changeset: [
			{
				"count": 1,
				"effect": {
					"attachAndDetach": {
						"attach": {
							"moveIn": {
								"revision": encodedTag1,
								"id": 0,
							},
						},
						"detach": {
							"moveOut": {
								"revision": encodedTag1,
								"idOverride": {
									"type": 0,
									"id": {
										"atom": [2, encodedTag2],
									},
								},
								"id": 3,
							},
						},
					},
				},
				"cellId": {
					"atom": [1, encodedTag1],
				},
				"changes": {
					"fieldChanges": [
						{
							"fieldKey": "",
							"fieldKind": "",
							"change": {
								"localId": 2,
								"testChange": {
									"inputContext": [],
									"intentions": [1],
									"outputContext": [1],
								},
							},
						},
					],
				},
			},
		],
	},
	{
		version: 2,
		changeset: [
			{
				"count": 1,
				"effect": {
					"attachAndDetach": {
						"attach": {
							"moveIn": {
								"revision": encodedTag1,
								"id": 0,
							},
						},
						"detach": {
							"moveOut": {
								"revision": encodedTag1,
								"idOverride": [2, encodedTag2],
								"id": 3,
							},
						},
					},
				},
				"cellId": [1, encodedTag1],
				"changes": {
					"fieldChanges": [
						{
							"fieldKey": "",
							"fieldKind": "",
							"change": {
								"localId": 2,
								"testChange": {
									"inputContext": [],
									"intentions": [1],
									"outputContext": [1],
								},
							},
						},
					],
				},
			},
		],
	},
];
