/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from '@fluidframework/common-utils';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { expect } from 'chai';
import { Definition, EditId, SessionId, TraitLabel } from '../../Identifiers';
import { Change, StablePlace, StableRange } from '../../ChangeTypes';
import { SharedTree } from '../../SharedTree';
import { ChangeInternal, ChangeNode, Edit, TraitMap } from '../../persisted-types';
import { revert } from '../../HistoryEditFactory';
import { IdCompressor } from '../../id-compressor';
import { TestTree } from './TestNode';
import {
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	setUpTestTree,
} from './TestUtilities';

/**
 * An entry into the summarySizeTests list.
 */
interface SummarySizeTestEntry {
	/** Helper to obtain the list of edits to apply to the SharedTree. */
	edits: (testTree: TestTree) => Change[][];
	/** Expected size of the summary of the SharedTree after applying the `edits`. */
	expectedSize: number;
	/** Description for the test and the edits applied. */
	description: string;
	/** Flag to determine whether to revert the applied edits or not. */
	revertEdits?: boolean;
}

/**
 * Summary size tests where `edits` are applied and checked against the `expectedSize`.
 */
const summarySizeTests: SummarySizeTestEntry[] = [
	{
		edits: (testTree) => [
			Change.insertTree(testTree.buildLeaf(), StablePlace.atEndOf(testTree.right.traitLocation)),
		],
		expectedSize: 1075,
		description: 'when inserting a node',
	},
	{
		edits: (testTree) => {
			const edits: Change[][] = [];
			for (let i = 0; i < 50; i++) {
				edits.push(Change.insertTree(testTree.buildLeaf(), StablePlace.atEndOf(testTree.right.traitLocation)));
			}
			return edits;
		},
		expectedSize: 10680,
		description: 'with 50 inserts',
	},
	{
		edits: (testTree) => {
			const node = testTree.buildLeaf(testTree.generateNodeId());
			return [
				Change.insertTree(testTree.buildLeaf(), StablePlace.atEndOf(testTree.right.traitLocation)),
				[Change.setPayload(node.identifier, 10)],
			];
		},
		expectedSize: 1170,
		description: 'when inserting and setting a node',
	},
	{
		edits: (testTree) => {
			const node = testTree.buildLeaf(testTree.generateNodeId());
			return [
				Change.insertTree(node, StablePlace.atEndOf(testTree.right.traitLocation)),
				[Change.delete(StableRange.only(node))],
			];
		},
		expectedSize: 1223,
		description: 'when inserting and deleting a node',
	},
	{
		edits: (testTree) => [
			Change.insertTree(testTree.buildLeaf(), StablePlace.atEndOf(testTree.right.traitLocation)),
		],
		expectedSize: 1223,
		description: 'when inserting and reverting a node',
		revertEdits: true,
	},
	{
		edits: (testTree) => [
			Change.insertTree(makeLargeTestTree(testTree), StablePlace.atStartOf(testTree.right.traitLocation)),
		],
		expectedSize: 76979,
		description: 'when inserting a large tree',
	},
	{
		edits: (testTree) => {
			const largeTree = makeLargeTestTree(testTree);
			return [
				Change.insertTree(largeTree, StablePlace.atStartOf(testTree.right.traitLocation)),
				Change.move(StableRange.only(largeTree), StablePlace.atEndOf(testTree.left.traitLocation)),
			];
		},
		expectedSize: 77243,
		description: 'when inserting and moving a large tree',
	},
];

/**
 * Runs a test suite for summaries on `SharedTree` that verifies their sizes do not exceed the defined limits.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSummarySizeTests(
	title: string,
	setUpLocalServerTestSharedTree: (
		options: LocalServerSharedTreeTestingOptions
	) => Promise<LocalServerSharedTreeTestingComponents>
) {
	describe(title, () => {
		const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

		let tree: SharedTree;
		let testTree: TestTree;
		let testObjectProvider: TestObjectProvider;

		// Resets the tree before each test
		beforeEach(async () => {
			const testingComponents = await setUpLocalServerTestSharedTree({
				setupEditId,
			});
			tree = testingComponents.tree;
			testTree = setUpTestTree(tree);
			testObjectProvider = testingComponents.testObjectProvider;
		});

		async function checkSummarySize(
			changes: Change[][],
			expectedSummarySize: number,
			revertEdits = false
		): Promise<void> {
			const edits = changes.map((e) => tree.applyEdit(...e));

			if (revertEdits) {
				for (let i = changes.length - 1; i >= 0; i--) {
					const editIndex = tree.edits.getIndexOfId(edits[i].id);
					const edit = tree.edits.getEditInSessionAtIndex(editIndex) as unknown as Edit<ChangeInternal>;
					const reverted = revert(edit.changes, tree.logViewer.getRevisionViewInSession(editIndex));
					if (reverted !== undefined) {
						tree.applyEditInternal(reverted);
					}
				}
			}

			// Wait for the ops to to be submitted and processed across the containers.
			await testObjectProvider.ensureSynchronized();

			const summary = tree.saveSerializedSummary();
			const summarySize = IsoBuffer.from(summary).byteLength;

			// TODO: make lte when 0.1.1 is settled
			expect(summarySize).to.equal(expectedSummarySize);
		}

		for (const { edits, expectedSize, description, revertEdits } of summarySizeTests) {
			it(`does not exceed ${expectedSize} ${description}`, async () => {
				await checkSummarySize(edits(testTree), expectedSize, revertEdits);
			});
		}
	});
}

function makeLargeTestTree(testTree: TestTree, nodesPerTrait = 10, traitsPerLevel = 2, levels = 2): ChangeNode {
	const specialSession = '9f858704-89f6-4923-abf3-14fc986e717f' as SessionId;
	// ensure uuids for traits and definitions are stable
	const compressor = new IdCompressor(specialSession, 0);
	const uuidv4 = (): string => compressor.decompress(compressor.generateCompressedId());
	const definition = uuidv4() as Definition;

	const traitLabels: TraitLabel[] = [];
	for (let i = 0; i < traitsPerLevel; i++) {
		traitLabels.push(uuidv4() as TraitLabel);
	}

	return {
		definition,
		identifier: testTree.generateNodeId(),
		traits: generateTraits(testTree, definition, traitLabels, nodesPerTrait, levels),
	};
}

function generateTraits(
	testTree: TestTree,
	definition: Definition,
	traitLabels: TraitLabel[],
	nodesPerTrait: number,
	totalLevels: number,
	level = 0
): TraitMap<ChangeNode> {
	const traits = {};

	traitLabels.forEach((label) => {
		traits[label] = Array.from(Array(nodesPerTrait).keys()).map(() => {
			return {
				definition,
				identifier: testTree.generateNodeId(),
				traits:
					level < totalLevels
						? generateTraits(testTree, definition, traitLabels, nodesPerTrait, totalLevels, level + 1)
						: {},
			};
		});
	});

	return traits;
}
