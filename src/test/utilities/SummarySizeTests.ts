/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { IsoBuffer } from '@fluidframework/common-utils';
// KLUDGE:#62681: Remove eslint ignore due to unresolved import false positive
import { TestObjectProvider } from '@fluidframework/test-utils'; // eslint-disable-line import/no-unresolved
import { expect } from 'chai';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import { Change, Delete, Insert, Move, revert, SharedTree, StablePlace, StableRange } from '../../default-edits';
import { ChangeNode, Edit, newEdit, TraitMap } from '../../generic';
import { Definition, EditId, NodeId, TraitLabel } from '../../Identifiers';
import {
	leftTraitLocation,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	makeEmptyNode,
	rightTraitLocation,
	simpleTestTree,
} from './TestUtilities';

/**
 * An entry into the summarySizeTests list.
 */
interface SummarySizeTestEntry {
	/** Helper to obtain the list of edits to apply to the SharedTree. */
	edits: () => Edit<Change>[];
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
		edits: () => [newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation)))],
		expectedSize: 1707,
		description: 'when inserting a node',
	},
	{
		edits: () => {
			const edits: Edit<Change>[] = [];
			for (let i = 0; i < 50; i++) {
				edits.push(newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation))));
			}
			return edits;
		},
		expectedSize: 21209,
		description: 'with 50 inserts',
	},
	{
		edits: () => {
			const node = makeEmptyNode();
			return [
				newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation))),
				newEdit([Change.setPayload(node.identifier, 10)]),
			];
		},
		expectedSize: 1843,
		description: 'when inserting and setting a node',
	},
	{
		edits: () => {
			const node = makeEmptyNode();
			return [
				newEdit(Insert.create([node], StablePlace.atEndOf(rightTraitLocation))),
				newEdit([Delete.create(StableRange.only(node))]),
			];
		},
		expectedSize: 1853,
		description: 'when inserting and deleting a node',
	},
	{
		edits: () => [newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation)))],
		expectedSize: 1853,
		description: 'when inserting and reverting a node',
		revertEdits: true,
	},
	{
		edits: () => [newEdit(Insert.create([makeLargeTestTree()], StablePlace.atStartOf(rightTraitLocation)))],
		expectedSize: 2057093,
		description: 'when inserting a large tree',
	},
	{
		edits: () => {
			const largeTree = makeLargeTestTree();
			return [
				newEdit(Insert.create([largeTree], StablePlace.atStartOf(rightTraitLocation))),
				newEdit(Move.create(StableRange.only(largeTree), StablePlace.atEndOf(leftTraitLocation))),
			];
		},
		expectedSize: 2057470,
		description: 'when inserting and moving a large tree',
	},
];

/**
 * Runs a test suite for summaries on `SharedTree` that verifies their sizes do not exceed the defined limits.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSummarySizeTests<TSharedTree extends SharedTree | SharedTreeWithAnchors>(
	title: string,
	setUpLocalServerTestSharedTree: (
		options: LocalServerSharedTreeTestingOptions
	) => Promise<LocalServerSharedTreeTestingComponents<TSharedTree>>
) {
	describe(title, () => {
		const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

		let tree: TSharedTree;
		let testObjectProvider: TestObjectProvider;

		// Resets the tree before each test
		beforeEach(async () => {
			const testingComponents = await setUpLocalServerTestSharedTree({
				setupEditId,
				initialTree: simpleTestTree,
			});
			tree = testingComponents.tree;
			testObjectProvider = testingComponents.testObjectProvider;
		});

		async function checkSummarySize(
			edits: Edit<Change>[],
			expectedSummarySize: number,
			revertEdits = false
		): Promise<void> {
			edits.forEach((edit) => tree.processLocalEdit(edit));

			if (revertEdits) {
				edits.forEach((edit) => {
					const editIndex = tree.edits.getIndexOfId(edit.id);
					tree.processLocalEdit(
						newEdit(revert(edit.changes, tree.logViewer.getRevisionViewInSession(editIndex)))
					);
				});
			}

			// Wait for the ops to to be submitted and processed across the containers.
			await testObjectProvider.ensureSynchronized();

			const summary = tree.saveSerializedSummary();
			const summarySize = IsoBuffer.from(summary).byteLength;
			expect(summarySize).to.equal(expectedSummarySize);
		}

		for (const { edits, expectedSize, description, revertEdits } of summarySizeTests) {
			it(`does not exceed ${expectedSize} ${description}`, async () => {
				await checkSummarySize(edits(), expectedSize, revertEdits);
			});
		}
	});
}

function makeLargeTestTree(nodesPerTrait = 10, traitsPerLevel = 2, levels = 2): ChangeNode {
	const definition = uuidv4() as Definition;

	const traitLabels: TraitLabel[] = [];
	for (let i = 0; i < traitsPerLevel; i++) {
		traitLabels.push(uuidv4() as TraitLabel);
	}

	return {
		definition,
		identifier: uuidv4() as NodeId,
		traits: generateTraits(definition, traitLabels, nodesPerTrait, levels),
	};
}

function generateTraits(
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
				identifier: uuidv4() as NodeId,
				traits:
					level < totalLevels
						? generateTraits(definition, traitLabels, nodesPerTrait, totalLevels, level + 1)
						: {},
			};
		});
	});

	return traits;
}
