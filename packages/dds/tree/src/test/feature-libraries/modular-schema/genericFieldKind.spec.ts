/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SessionId } from "@fluidframework/id-compressor";
import type { GenericChangeset } from "../../../feature-libraries/index.js";
import { fakeIdAllocator, brand, idAllocatorFromMaxId } from "../../../util/index.js";
import {
	type EncodingTestData,
	defaultRevisionMetadataFromChanges,
	makeEncodingTestSuite,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";
import {
	type FieldChangeEncodingContext,
	type NodeId,
	type RebaseRevisionMetadata,
	genericChangeHandler,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
import { TestNodeId } from "../../testNodeId.js";
import { TestChange } from "../../testChange.js";
import { testSnapshots } from "./genericFieldSnapshots.test.js";
// eslint-disable-next-line import/no-internal-modules
import { newGenericChangeset } from "../../../feature-libraries/modular-schema/genericFieldKindTypes.js";
import { failComposeManager, failInvertManager, failRebaseManager } from "./nodeQueryUtils.js";
import type { DeltaFieldChanges } from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { contextualizeFieldChangeset } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };
const nodeId3: NodeId = { localId: brand(3) };
const nodeId4: NodeId = { localId: brand(4) };

const revisionMetadata: RebaseRevisionMetadata = {
	getRevisionToRebase: () => assert.fail("Unexpected revision info query"),
	getBaseRevisions: () => assert.fail("Unexpected revision info query"),
	compareRevisions: () => assert.fail("Unexpected revision index query"),
	tryGetInfo: () => assert.fail("Unexpected revision info query"),
	hasRollback: () => assert.fail("Unexpected revision info query"),
};

describe("GenericField", () => {
	testSnapshots();

	describe("compose", () => {
		it("Highest index on earlier change", () => {
			const changeA: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([], 1))],
				[2, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const changeB: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId3, TestChange.mint([1], 3))],
				[1, TestNodeId.create(nodeId4, TestChange.mint([], 4))],
			]);
			const expected: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([], [1, 3]))],
				[1, TestNodeId.create(nodeId4, TestChange.mint([], 4))],
				[2, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const actual = genericChangeHandler.rebaser.compose(
				contextualizeFieldChangeset(changeA),
				contextualizeFieldChangeset(changeB),
				TestNodeId.composeChild,
				fakeIdAllocator,
				failComposeManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});

		it("Highest index on later change", () => {
			const changeA: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([], 1))],
				[1, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const changeB: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId3, TestChange.mint([1], 3))],
				[2, TestNodeId.create(nodeId4, TestChange.mint([], 4))],
			]);
			const expected: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([], [1, 3]))],
				[1, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
				[2, TestNodeId.create(nodeId4, TestChange.mint([], 4))],
			]);
			const actual = genericChangeHandler.rebaser.compose(
				contextualizeFieldChangeset(changeA),
				contextualizeFieldChangeset(changeB),
				TestNodeId.composeChild,
				fakeIdAllocator,
				failComposeManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});
	});

	describe("rebase", () => {
		it("Highest index on earlier change", () => {
			const changeA: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([], 1))],
				[2, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const changeB: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId3, TestChange.mint([], 3))],
				[1, TestNodeId.create(nodeId4, TestChange.mint([], 4))],
			]);
			const expected: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([3], 1))],
				[2, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const actual = genericChangeHandler.rebaser.rebase(
				contextualizeFieldChangeset(changeA),
				contextualizeFieldChangeset(changeB),
				TestNodeId.rebaseChild,
				fakeIdAllocator,
				failRebaseManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});

		it("Highest index on later change", () => {
			const changeA: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([], 1))],
				[1, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const changeB: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId3, TestChange.mint([], 3))],
				[2, TestNodeId.create(nodeId4, TestChange.mint([], 4))],
			]);
			const expected: GenericChangeset = newGenericChangeset([
				[0, TestNodeId.create(nodeId1, TestChange.mint([3], 1))],
				[1, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
			]);
			const actual = genericChangeHandler.rebaser.rebase(
				contextualizeFieldChangeset(changeA),
				contextualizeFieldChangeset(changeB),
				TestNodeId.rebaseChild,
				fakeIdAllocator,
				failRebaseManager,
				revisionMetadata,
			);
			assert.deepEqual(actual, expected);
		});
	});

	it("invert", () => {
		const forward: GenericChangeset = newGenericChangeset([
			[0, nodeId1],
			[1, nodeId2],
		]);
		const expected: GenericChangeset = newGenericChangeset([
			[0, nodeId1],
			[1, nodeId2],
		]);
		const actual = genericChangeHandler.rebaser.invert(
			contextualizeFieldChangeset(forward, undefined),
			true,
			idAllocatorFromMaxId(),
			mintRevisionTag(),
			failInvertManager,
			defaultRevisionMetadataFromChanges([]),
		);
		assert.deepEqual(actual, expected);
	});

	it("intoDelta", () => {
		const nodeChange1 = TestNodeId.create(nodeId1, TestChange.mint([], 1));
		const nodeChange2 = TestNodeId.create(nodeId2, TestChange.mint([], 2));
		const input: GenericChangeset = newGenericChangeset([
			[0, nodeChange1],
			[2, nodeChange2],
		]);

		const expected: DeltaFieldChanges = [
			{ count: 1, fields: TestNodeId.deltaFromChild(nodeChange1) },
			{ count: 1 },
			{ count: 1, fields: TestNodeId.deltaFromChild(nodeChange2) },
		];

		const actual = genericChangeHandler.intoDelta(input, TestNodeId.deltaFromChild);
		assert.deepEqual(actual, expected);
	});

	describe("Encoding", () => {
		const baseContext = {
			originatorId: "session1" as SessionId,
			revision: undefined,
			idCompressor: testIdCompressor,
		};

		const encodingTestData: EncodingTestData<
			GenericChangeset,
			unknown,
			FieldChangeEncodingContext
		> = {
			successes: [
				[
					"Misc",
					newGenericChangeset([
						[0, TestNodeId.create(nodeId1, TestChange.mint([], 1))],
						[2, TestNodeId.create(nodeId2, TestChange.mint([], 2))],
					]),
					{
						baseContext,
						encodeNode: (nodeId) => TestNodeId.encode(nodeId, baseContext),
						decodeNode: (nodeId) => TestNodeId.decode(nodeId, baseContext),
					},
				],
			],
		};

		makeEncodingTestSuite(
			genericChangeHandler.codecsFactory(testRevisionTagCodec),
			encodingTestData,
		);
	});

	it("build empty child change", () => {
		const change0 = genericChangeHandler.editor.buildChildChanges([]);
		assert.deepEqual(change0, newGenericChangeset([]));
	});

	it("build child changes", () => {
		const change0 = genericChangeHandler.editor.buildChildChanges([
			[0, nodeId1],
			[1, nodeId2],
			[2, nodeId3],
		]);
		assert.deepEqual(
			change0,
			newGenericChangeset([
				[0, nodeId1],
				[1, nodeId2],
				[2, nodeId3],
			]),
		);
	});
});
