/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionId } from "@fluidframework/id-compressor";
import {
	GenericChangeset,
	genericFieldKind,
	CrossFieldManager,
	MemoizedIdRangeAllocator,
} from "../../../feature-libraries/index.js";
import { makeAnonChange, DeltaFieldChanges } from "../../../core/index.js";
import { fakeIdAllocator, brand, idAllocatorFromMaxId } from "../../../util/index.js";
import {
	EncodingTestData,
	defaultRevisionMetadataFromChanges,
	makeEncodingTestSuite,
	testRevisionTagCodec,
} from "../../utils.js";
import {
	FieldChangeEncodingContext,
	NodeId,
	RebaseRevisionMetadata,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { TestNodeId } from "../../testNodeId.js";
import { TestChange } from "../../testChange.js";
import { testSnapshots } from "./genericFieldSnapshots.test.js";

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };
const nodeId3: NodeId = { localId: brand(3) };
const nodeId4: NodeId = { localId: brand(4) };

const unexpectedDelegate = () => assert.fail("Unexpected call");

const revisionMetadata: RebaseRevisionMetadata = {
	getBaseRevisions: () => assert.fail("Unexpected revision info query"),
	getIndex: () => assert.fail("Unexpected revision index query"),
	tryGetInfo: () => assert.fail("Unexpected revision info query"),
	hasRollback: () => assert.fail("Unexpected revision info query"),
};

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
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], 1)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId3, TestChange.mint([1], 3)),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId4, TestChange.mint([], 4)),
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], [1, 3])),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId4, TestChange.mint([], 4)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.compose(
				makeAnonChange(changeA),
				makeAnonChange(changeB),
				TestNodeId.composeChild,
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
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], 1)),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId3, TestChange.mint([1], 3)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId4, TestChange.mint([], 4)),
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], [1, 3])),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId4, TestChange.mint([], 4)),
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.compose(
				makeAnonChange(changeA),
				makeAnonChange(changeB),
				TestNodeId.composeChild,
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
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], 1)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId3, TestChange.mint([], 3)),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId4, TestChange.mint([], 4)),
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([3], 1)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.rebase(
				changeA,
				makeAnonChange(changeB),
				TestNodeId.rebaseChild,
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
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], 1)),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const changeB: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId3, TestChange.mint([], 3)),
				},
				{
					index: 2,
					nodeChange: TestNodeId.create(nodeId4, TestChange.mint([], 4)),
				},
			];
			const expected: GenericChangeset = [
				{
					index: 0,
					nodeChange: TestNodeId.create(nodeId1, TestChange.mint([3], 1)),
				},
				{
					index: 1,
					nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
				},
			];
			const actual = genericFieldKind.changeHandler.rebaser.rebase(
				changeA,
				makeAnonChange(changeB),
				TestNodeId.rebaseChild,
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
				nodeChange: nodeId1,
			},
			{
				index: 1,
				nodeChange: nodeId2,
			},
		];
		const expected: GenericChangeset = [
			{
				index: 0,
				nodeChange: nodeId1,
			},
			{
				index: 1,
				nodeChange: nodeId2,
			},
		];
		const taggedChange = makeAnonChange(forward);
		const actual = genericFieldKind.changeHandler.rebaser.invert(
			taggedChange,
			true,
			idAllocatorFromMaxId(),
			crossFieldManager,
			defaultRevisionMetadataFromChanges([taggedChange]),
		);
		assert.deepEqual(actual, expected);
	});

	it("intoDelta", () => {
		const testChange1 = TestChange.mint([], 1);
		const testChange2 = TestChange.mint([], 2);
		const input: GenericChangeset = [
			{
				index: 0,
				nodeChange: TestNodeId.create(nodeId1, testChange1),
			},
			{
				index: 2,
				nodeChange: TestNodeId.create(nodeId2, testChange2),
			},
		];

		const expected: DeltaFieldChanges = {
			local: [
				{ count: 1, fields: TestChange.toDelta(makeAnonChange(testChange1)) },
				{ count: 1 },
				{ count: 1, fields: TestChange.toDelta(makeAnonChange(testChange2)) },
			],
		};

		const actual = genericFieldKind.changeHandler.intoDelta(
			makeAnonChange(input),
			TestNodeId.deltaFromChild,
			MemoizedIdRangeAllocator.fromNextId(),
		);
		assert.deepEqual(actual, expected);
	});

	describe("Encoding", () => {
		const encodingTestData: EncodingTestData<
			GenericChangeset,
			unknown,
			FieldChangeEncodingContext
		> = {
			successes: [
				[
					"Misc",
					[
						{
							index: 0,
							nodeChange: TestNodeId.create(nodeId1, TestChange.mint([], 1)),
						},
						{
							index: 2,
							nodeChange: TestNodeId.create(nodeId2, TestChange.mint([], 2)),
						},
					],
					{
						baseContext: { originatorId: "session1" as SessionId },
						encodeNode: TestNodeId.encode,
						decodeNode: TestNodeId.decode,
					},
				],
			],
		};

		makeEncodingTestSuite(
			genericFieldKind.changeHandler.codecsFactory(testRevisionTagCodec),
			encodingTestData,
		);
	});

	it("build child change", () => {
		const change0 = genericFieldKind.changeHandler.editor.buildChildChange(0, nodeId1);
		const change1 = genericFieldKind.changeHandler.editor.buildChildChange(1, nodeId2);
		const change2 = genericFieldKind.changeHandler.editor.buildChildChange(2, nodeId3);
		assert.deepEqual(change0, [{ index: 0, nodeChange: nodeId1 }]);
		assert.deepEqual(change1, [{ index: 1, nodeChange: nodeId2 }]);
		assert.deepEqual(change2, [{ index: 2, nodeChange: nodeId3 }]);
	});

	it("relevantRemovedRoots", () => {
		const actual = genericFieldKind.changeHandler.relevantRemovedRoots(
			makeAnonChange([
				{
					index: 0,
					nodeChange: nodeId1,
				},
				{
					index: 2,
					nodeChange: nodeId2,
				},
			]),
			(child) =>
				child === nodeId1
					? [{ minor: 42 }]
					: child === nodeId2
					? [{ minor: 43 }]
					: assert.fail("Unexpected child"),
		);
		assert.deepEqual(Array.from(actual), [{ minor: 42 }, { minor: 43 }]);
	});
});
