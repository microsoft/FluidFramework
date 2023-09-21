/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	NodeChangeset,
	GenericChangeset,
	genericFieldKind,
	CrossFieldManager,
	RevisionMetadataSource,
	MemoizedIdRangeAllocator,
} from "../../../feature-libraries";
import { makeAnonChange, tagChange, TaggedChange, Delta, FieldKey } from "../../../core";
import { IdAllocator, brand } from "../../../util";
import {
	EncodingTestData,
	fakeTaggedRepair as fakeRepair,
	makeEncodingTestSuite,
} from "../../utils";
import { IJsonCodec } from "../../../codec";
import { singleJsonCursor } from "../../../domains";
import { ValueChangeset, valueField, valueHandler } from "./basicRebasers";

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

const idAllocator: IdAllocator = unexpectedDelegate;

const revisionMetadata: RevisionMetadataSource = {
	getIndex: () => assert.fail("Unexpected revision index query"),
	getInfo: () => assert.fail("Unexpected revision info query"),
};

const childComposer = (nodeChanges: TaggedChange<NodeChangeset>[]): NodeChangeset => {
	const valueChanges = nodeChanges.map((c) =>
		tagChange(valueChangeFromNodeChange(c.change), c.revision),
	);
	const valueChange = valueHandler.rebaser.compose(
		valueChanges,
		unexpectedDelegate,
		idAllocator,
		crossFieldManager,
		revisionMetadata,
	);
	return nodeChangeFromValueChange(valueChange);
};

const childInverter = (nodeChange: NodeChangeset): NodeChangeset => {
	const valueChange = valueChangeFromNodeChange(nodeChange);
	const inverse = valueHandler.rebaser.invert(
		makeAnonChange(valueChange),
		unexpectedDelegate,
		fakeRepair,
		idAllocator,
		crossFieldManager,
	);
	return nodeChangeFromValueChange(inverse);
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
		idAllocator,
		crossFieldManager,
		revisionMetadata,
	);
	return nodeChangeFromValueChange(rebased);
};

const childToDelta = (nodeChange: NodeChangeset): Delta.Modify => {
	const valueChange = valueChangeFromNodeChange(nodeChange);
	assert(typeof valueChange !== "number");
	const nodeDelta: Delta.Modify = {
		type: Delta.MarkType.Modify,
		fields: new Map([
			[
				valueFieldKey,
				[
					{ type: Delta.MarkType.Delete, count: 1 },
					{ type: Delta.MarkType.Insert, content: [singleJsonCursor(valueChange.new)] },
				],
			],
		]),
	};
	return nodeDelta;
};

const crossFieldManager: CrossFieldManager = {
	get: unexpectedDelegate,
	set: unexpectedDelegate,
};

describe("Generic FieldKind", () => {
	describe("compose", () => {
		it("empty list", () => {
			const actual = genericFieldKind.changeHandler.rebaser.compose(
				[],
				childComposer,
				idAllocator,
				crossFieldManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, []);
		});

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
				[makeAnonChange(changeA), makeAnonChange(changeB)],
				childComposer,
				idAllocator,
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
				[makeAnonChange(changeA), makeAnonChange(changeB)],
				childComposer,
				idAllocator,
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
				idAllocator,
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
				idAllocator,
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
		const actual = genericFieldKind.changeHandler.rebaser.invert(
			makeAnonChange(forward),
			childInverter,
			fakeRepair,
			idAllocator,
			crossFieldManager,
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

		const valueDelta1: Delta.Mark = {
			type: Delta.MarkType.Modify,
			fields: new Map([
				[
					valueFieldKey,
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{ type: Delta.MarkType.Insert, content: [singleJsonCursor(1)] },
					],
				],
			]),
		};

		const valueDelta2: Delta.Mark = {
			type: Delta.MarkType.Modify,
			fields: new Map([
				[
					valueFieldKey,
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{ type: Delta.MarkType.Insert, content: [singleJsonCursor(2)] },
					],
				],
			]),
		};

		const expected: Delta.MarkList = [valueDelta1, 1, valueDelta2];

		const actual = genericFieldKind.changeHandler.intoDelta(
			makeAnonChange(input),
			childToDelta,
			MemoizedIdRangeAllocator.fromNextId(),
		);
		assert.deepEqual(actual, expected);
	});

	describe("Encoding", () => {
		const encodingTestData: EncodingTestData<GenericChangeset, unknown> = {
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
				],
			],
		};

		const throwCodec: IJsonCodec<any> = {
			encode: unexpectedDelegate,
			decode: unexpectedDelegate,
		};

		const leafCodec = valueHandler.codecsFactory(throwCodec).resolve(0).json;
		const childCodec: IJsonCodec<NodeChangeset> = {
			encode: (nodeChange) => {
				const valueChange = valueChangeFromNodeChange(nodeChange);
				return leafCodec.encode(valueChange);
			},
			decode: (nodeChange) => {
				const valueChange = leafCodec.decode(nodeChange);
				return nodeChangeFromValueChange(valueChange);
			},
		};

		makeEncodingTestSuite(
			genericFieldKind.changeHandler.codecsFactory(childCodec),
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
});
