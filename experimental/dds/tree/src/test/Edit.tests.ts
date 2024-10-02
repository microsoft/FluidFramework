/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';

import { deepCompareNodes } from '../EditUtilities.js';
import { ChangeNode } from '../persisted-types/index.js';

import { refreshTestTree } from './utilities/TestUtilities.js';

// TODO #45414: Re-enable when compareEdits compares the actual changes instead of just the edit IDs.
// 			    Commented out instead of skipped to avoid linting errors.
// describe('compareSequencedEdits', () => {
// 	it('correctly compares two equal sequenced edits', () => {
// 		const node = makeTestNode();
// 		const editId = '75dd0d7d-ea87-40cf-8860-dc2b9d827597' as EditId;
// 		const editA: Edit = {
// 			changes: [Change.delete(StableRange.only(node))],
// 		};

// 		const sequencedEditB: Edit = {
// 			changes: [Change.delete(StableRange.only(node))],
// 		};

// 		expect(compareEdits(editA, sequencedEditB)).to.be.true;
// 	});

// 	it('correctly compares two non-equal sequenced edits', () => {
// 		const node = makeTestNode();
// 		const nodeDestination = makeTestNode();

// 		const sequencedEditA: Edit = {
// 			changes: [Change.delete(StableRange.only(node))],
// 			id: '7366efae-f96a-4f5d-9c6c-eea62ac6dffb' as EditId,
// 		};

// 		const sequencedEditB: Edit = {
// 			changes: [...Change.move(StableRange.only(node), StablePlace.before(nodeDestination))],
// 			id: '57cb9fa9-9d1d-49eb-919a-5636ed55a65a' as EditId,
// 		};

// 		expect(compareEdits(sequencedEditA, sequencedEditB)).to.be.false;
// 	});
// });

describe('deepCompareNodes', () => {
	const testTree = refreshTestTree();

	it('correctly compares two empty nodes', () => {
		const nodeId = testTree.generateNodeId();
		expect(deepCompareNodes(testTree.buildLeaf(nodeId), testTree.buildLeaf(nodeId))).to.be.true;
	});

	it('correctly compares two deeply equal nodes', () => {
		const otherTree: ChangeNode = {
			definition: testTree.definition,
			identifier: testTree.identifier,
			traits: {
				left: [
					{
						definition: testTree.left.definition,
						identifier: testTree.left.identifier,
						traits: {},
					},
				],
				right: [
					{
						definition: testTree.right.definition,
						identifier: testTree.right.identifier,
						traits: {},
					},
				],
			},
		};
		expect(deepCompareNodes(testTree, otherTree)).to.be.true;
	});

	it('returns false for unequal nodes', () => {
		expect(
			deepCompareNodes(testTree.buildLeaf(testTree.generateNodeId()), testTree.buildLeaf(testTree.generateNodeId()))
		).to.be.false;
		expect(deepCompareNodes(testTree.buildLeaf(testTree.identifier), testTree)).to.be.false;
		expect(deepCompareNodes(testTree.buildLeaf(testTree.identifier), testTree)).to.be.false;
		expect(deepCompareNodes(testTree, testTree.buildLeaf(testTree.identifier))).to.be.false;
	});
});
