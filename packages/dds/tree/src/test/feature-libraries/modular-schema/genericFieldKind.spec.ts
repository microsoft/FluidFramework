/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionId } from "@fluidframework/id-compressor";
import { IJsonCodec } from "../../../codec/index.js";
import {
	ChangeEncodingContext,
	DeltaFieldChanges,
	DeltaFieldMap,
	FieldKey,
	makeAnonChange,
} from "../../../core/index.js";
import {
	CrossFieldManager,
	GenericChangeset,
	MemoizedIdRangeAllocator,
	NodeChangeset,
	genericFieldKind,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { RebaseRevisionMetadata } from "../../../feature-libraries/modular-schema/index.js";
import {
	JsonCompatibleReadOnly,
	brand,
	fakeIdAllocator,
	idAllocatorFromMaxId,
} from "../../../util/index.js";
import {
	EncodingTestData,
	defaultRevisionMetadataFromChanges,
	makeEncodingTestSuite,
	testRevisionTagCodec,
} from "../../utils.js";
import { ValueChangeset, valueField, valueHandler } from "./basicRebasers.js";
import { testSnapshots } from "./genericFieldSnapshots.test.js";

const valueFieldKey: FieldKey = brand("Value");

const fieldA: FieldKey = brand("a");

const valueChange0To1: ValueChangeset = { old: 0, new: 1 };
const valueChange1To0: ValueChangeset = { old: 1, new: 0 };
const valueChange1To2: ValueChangeset = { old: 1, new: 2 };
const valueChange2To1: ValueChangeset = { old: 2, new: 1 };
const valueChange0To2: ValueChangeset = { old: 0, new: 2 };

function nodeChangeFromValueChange(valueChange: ValueChangeset): NodeChangeset {
	return {
		fieldChanges: new Map([
			[
				fieldA,
				{
					fieldKind: valueField.identifier,
					change: brand(valueChange),
				},
			],
		]),
	};
}

function valueChangeFromNodeChange(nodeChange: NodeChangeset): ValueChangeset {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return nodeChange.fieldChanges!.get(fieldA)!.change as unknown as ValueChangeset;
}

const nodeChange0To1: NodeChangeset = nodeChangeFromValueChange(valueChange0To1);
const nodeChange1To0: NodeChangeset = nodeChangeFromValueChange(valueChange1To0);
const nodeChange1To2: NodeChangeset = nodeChangeFromValueChange(valueChange1To2);
const nodeChange2To1: NodeChangeset = nodeChangeFromValueChange(valueChange2To1);
const nodeChange0To2: NodeChangeset = nodeChangeFromValueChange(valueChange0To2);

const unexpectedDelegate = () => assert.fail("Unexpected call");

const revisionMetadata: RebaseRevisionMetadata = {
	getBaseRevisions: () => assert.fail("Unexpected revision info query"),
	getIndex: () => assert.fail("Unexpected revision index query"),
	tryGetInfo: () => assert.fail("Unexpected revision info query"),
	hasRollback: () => assert.fail("Unexpected revision info query"),
};

const childComposer = (
	nodeChange1: NodeChangeset | undefined,
	nodeChange2: NodeChangeset | undefined,
): NodeChangeset => {
	if (nodeChange1 === undefined) {
		assert(nodeChange2 !== undefined, "Should not compose two undefined changesets");
		return nodeChange2;
	} else if (nodeChange2 === undefined) {
		return nodeChange1;
	}

	const valueChange = valueHandler.rebaser.compose(
		makeAnonChange(valueChangeFromNodeChange(nodeChange1 ?? {})),
		makeAnonChange(valueChangeFromNodeChange(nodeChange2 ?? {})),
		unexpectedDelegate,
		fakeIdAllocator,
		crossFieldManager,
		revisionMetadata,
	);
	return nodeChangeFromValueChange(valueChange);
};

const childRebaser = (
	nodeChangeA: NodeChangeset | undefined,
	nodeChangeB: NodeChangeset | undefined,
): NodeChangeset | undefined => {
	if (nodeChangeA === undefined) {
		return undefined;
	}

	if (nodeChangeB === undefined) {
		return nodeChangeA;
	}

	const valueChangeA = valueChangeFromNodeChange(nodeChangeA);
	const valueChangeB = valueChangeFromNodeChange(nodeChangeB);
	const rebased = valueHandler.rebaser.rebase(
		valueChangeA,
		makeAnonChange(valueChangeB),
		unexpectedDelegate,
		fakeIdAllocator,
		crossFieldManager,
		revisionMetadata,
	);
	return nodeChangeFromValueChange(rebased);
};

const childToDelta = (nodeChange: NodeChangeset): DeltaFieldMap => {
	const valueChange = valueChangeFromNodeChange(nodeChange);
	assert(typeof valueChange !== "number");
	return deltaForValueChange(valueChange);
};

function deltaForValueChange(valueChange: ValueChangeset): DeltaFieldMap {
	return new Map([[valueFieldKey, valueHandler.intoDelta(makeAnonChange(valueChange))]]);
}

const crossFieldManager: CrossFieldManager = {
	get: unexpectedDelegate,
	set: unexpectedDelegate,
};

describe("GenericField", () => {
	testSnapshots();

	describe("compose", () => {
		it("Highest index on earlier change", () => {
			const changeA: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To1,
				},
				{
					index: 2,
					nodeChange: nodeChange0To1,
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange1To2,
				},
				{
					index: 1,
					nodeChange: nodeChange1To2,
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To2,
				},
				{
					index: 1,
					nodeChange: nodeChange1To2,
				},
				{
					index: 2,
					nodeChange: nodeChange0To1,
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.compose(
				makeAnonChange(changeA),
				makeAnonChange(changeB),
				childComposer,
				fakeIdAllocator,
				crossFieldManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});

		it("Highest index on later change", () => {
			const changeA: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To1,
				},
				{
					index: 1,
					nodeChange: nodeChange0To1,
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange1To2,
				},
				{
					index: 2,
					nodeChange: nodeChange1To2,
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To2,
				},
				{
					index: 1,
					nodeChange: nodeChange0To1,
				},
				{
					index: 2,
					nodeChange: nodeChange1To2,
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.compose(
				makeAnonChange(changeA),
				makeAnonChange(changeB),
				childComposer,
				fakeIdAllocator,
				crossFieldManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("rebase", () => {
		it("Highest index on earlier change", () => {
			const changeA: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To2,
				},
				{
					index: 2,
					nodeChange: nodeChange1To2,
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To1,
				},
				{
					index: 1,
					nodeChange: nodeChange0To1,
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange1To2,
				},
				{
					index: 2,
					nodeChange: nodeChange1To2,
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.rebase(
				changeA,
				makeAnonChange(changeB),
				childRebaser,
				fakeIdAllocator,
				crossFieldManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});

		it("Highest index on later change", () => {
			const changeA: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To2,
				},
				{
					index: 1,
					nodeChange: nodeChange1To2,
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange0To1,
				},
				{
					index: 2,
					nodeChange: nodeChange0To1,
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: nodeChange1To2,
				},
				{
					index: 1,
					nodeChange: nodeChange1To2,
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.rebase(
				changeA,
				makeAnonChange(changeB),
				childRebaser,
				fakeIdAllocator,
				crossFieldManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});
	});

	it("invert", () => {
		const forward: GenericChangeset = [
			{
				index: 0,
				nodeChange: nodeChange0To1,
			},
			{
				index: 1,
				nodeChange: nodeChange1To2,
			},
		];
		const expected: GenericChangeset = [
			{
				index: 0,
				nodeChange: nodeChange1To0,
			},
			{
				index: 1,
				nodeChange: nodeChange2To1,
			},
		];
		const taggedChange = makeAnonChange(forward);
		const actual = genericFieldKind.changeHandler.rebaser.invert(
			taggedChange,
			(nodeChange: NodeChangeset): NodeChangeset => {
				if (nodeChange === nodeChange0To1) {
					return nodeChange1To0;
				}
				if (nodeChange === nodeChange1To2) {
					return nodeChange2To1;
				}
				assert.fail("Unexpected child change");
			},
			true,
			idAllocatorFromMaxId(),
			crossFieldManager,
			defaultRevisionMetadataFromChanges([taggedChange]),
		);
		assert.deepEqual(actual, expected);
	});

	it("intoDelta", () => {
		const input: GenericChangeset = [
			{
				index: 0,
				nodeChange: nodeChange0To1,
			},
			{
				index: 2,
				nodeChange: nodeChange1To2,
			},
		];

		const expected: DeltaFieldChanges = {
			local: [
				{ count: 1, fields: deltaForValueChange(valueChange0To1) },
				{ count: 1 },
				{ count: 1, fields: deltaForValueChange(valueChange1To2) },
			],
		};

		const actual = genericFieldKind.changeHandler.intoDelta(
			makeAnonChange(input),
			childToDelta,
			MemoizedIdRangeAllocator.fromNextId(),
		);
		assert.deepEqual(actual, expected);
	});

	describe("Encoding", () => {
		const encodingTestData: EncodingTestData<GenericChangeset, unknown, ChangeEncodingContext> =
			{
				successes: [
					[
						"Misc",
						[
							{
								index: 0,
								nodeChange: nodeChange0To1,
							},
							{
								index: 2,
								nodeChange: nodeChange1To2,
							},
						],
						{ originatorId: "session1" as SessionId },
					],
				],
			};

		const leafCodec = valueHandler.codecsFactory().resolve(0).json;
		const childCodec: IJsonCodec<
			NodeChangeset,
			JsonCompatibleReadOnly,
			JsonCompatibleReadOnly,
			ChangeEncodingContext
		> = {
			encode: (nodeChange, context) => {
				const valueChange = valueChangeFromNodeChange(nodeChange);
				return leafCodec.encode(valueChange, context);
			},
			decode: (nodeChange, originatorId) => {
				const valueChange = leafCodec.decode(nodeChange, originatorId);
				return nodeChangeFromValueChange(valueChange);
			},
		};

		makeEncodingTestSuite(
			genericFieldKind.changeHandler.codecsFactory(childCodec, testRevisionTagCodec),
			encodingTestData,
		);
	});

	it("build child change", () => {
		const change0 = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeChange0To1);
		const change1 = genericFieldKind.changeHandler.editor.buildChildChange(1, nodeChange0To1);
		const change2 = genericFieldKind.changeHandler.editor.buildChildChange(2, nodeChange0To1);
		assert.deepEqual(change0, [{ index: 0, nodeChange: nodeChange0To1 }]);
		assert.deepEqual(change1, [{ index: 1, nodeChange: nodeChange0To1 }]);
		assert.deepEqual(change2, [{ index: 2, nodeChange: nodeChange0To1 }]);
	});

	it("relevantRemovedRoots", () => {
		const actual = genericFieldKind.changeHandler.relevantRemovedRoots(
			makeAnonChange([
				{
					index: 0,
					nodeChange: nodeChange0To1,
				},
				{
					index: 2,
					nodeChange: nodeChange1To2,
				},
			]),
			(child) =>
				child === nodeChange0To1
					? [{ minor: 42 }]
					: child === nodeChange1To2
					? [{ minor: 43 }]
					: assert.fail("Unexpected child"),
		);
		assert.deepEqual(Array.from(actual), [{ minor: 42 }, { minor: 43 }]);
	});
});
