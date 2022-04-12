/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { TraitLabel } from '../Identifiers';
import { getChangeNodeFromViewNode } from '../SerializationUtilities';
import { ChangeNode } from '../persisted-types';
import { convertTreeNodesToViewNodes, RevisionView } from '../RevisionView';
import { StablePlace, StableRange } from '../ChangeTypes';
import { detachRange, insertIntoTrait } from '../EditUtilities';
import { expectDefined } from './utilities/TestCommon';
import { LeafNode, TestNode } from './utilities/TestNode';
import { refreshTestTree } from './utilities/TestUtilities';

describe('RevisionView', () => {
	const testTree = refreshTestTree();

	describe('creation from a ChangeNode', () => {
		it('ignores empty traits', () => {
			const leaf = testTree.buildLeaf(testTree.generateNodeId());
			const node: ChangeNode = {
				traits: {
					trait: [leaf],
					emptyTrait: [],
				},
				definition: testTree.definition,
				identifier: testTree.identifier,
			};

			const view = RevisionView.fromTree(node);
			const changeNode = getChangeNodeFromViewNode(view, testTree.identifier);
			expect(changeNode.traits.trait[0].identifier).to.equal(leaf.identifier);
			expect(changeNode.traits.emptyTrait).to.equal(undefined);
		});
	});

	it('correctly converts tree nodes', () => {
		const viewNodes = expectDefined(
			convertTreeNodesToViewNodes<TestNode>(testTree, (node) => ({
				definition: node.definition,
				identifier: node.identifier,
			}))
		);
		let createdRoot = false;
		let createdLeft = false;
		let createdRight = false;
		for (let viewNode = viewNodes.pop(); viewNode !== undefined; viewNode = viewNodes.pop()) {
			switch (viewNode.identifier) {
				case testTree.identifier:
					expect(createdRoot).to.be.false;
					expect(viewNode.definition).to.equal(testTree.definition);
					expect(viewNode.traits.size).to.equal(2);
					expect(viewNode.traits.get(testTree.left.traitLabel)).to.deep.equal([testTree.left.identifier]);
					expect(viewNode.traits.get(testTree.right.traitLabel)).to.deep.equal([testTree.right.identifier]);
					createdRoot = true;
					break;
				case testTree.left.identifier:
					expect(createdLeft).to.be.false;
					expect(viewNode.definition).to.equal(testTree.left.definition);
					expect(viewNode.traits.size).to.equal(0);
					createdLeft = true;
					break;
				case testTree.right.identifier:
					expect(createdRight).to.be.false;
					expect(viewNode.definition).to.equal(testTree.right.definition);
					expect(viewNode.traits.size).to.equal(0);
					createdRight = true;
					break;
				default:
					expect.fail('Unexpected view node ID');
			}
		}
	});

	it('correctly handles tree node conversion failure', () => {
		let nodesConverted = 0;
		const viewNodes = convertTreeNodesToViewNodes<TestNode>(testTree, (node) => {
			if (nodesConverted++ >= 2) {
				return undefined;
			}
			return {
				definition: node.definition,
				identifier: node.identifier,
			};
		});

		expect(viewNodes).to.be.undefined;
	});
});

describe('TransactionView', () => {
	const testTree = refreshTestTree();
	const traitLabel = 'trait' as TraitLabel;

	function getTree(): {
		parent: ChangeNode;
		childA: LeafNode<ChangeNode>;
		childB: LeafNode<ChangeNode>;
	} {
		const childA = testTree.buildLeaf(testTree.generateNodeId());
		const childB = testTree.buildLeaf(testTree.generateNodeId());
		const parent: ChangeNode = {
			traits: {
				[traitLabel]: [childA, childB],
			},
			definition: testTree.definition,
			identifier: testTree.identifier,
		};
		return { parent, childA, childB };
	}

	it('can detach a single node in a trait', () => {
		const { parent, childA, childB } = getTree();
		const startingView = RevisionView.fromTree(parent).openForTransaction();
		const { view } = detachRange(startingView, StableRange.only(childA));
		expect(view.size).to.equal(3);
		expect(view.hasNode(childA.identifier)).to.be.true;
		expect(view.tryGetParentViewNode(childA.identifier)).to.be.undefined;
		expect(view.tryGetParentViewNode(childB.identifier)?.identifier).to.equal(parent.identifier);
		expect(view.getIndexInTrait(childB.identifier)).to.equal(0);
	});

	it('can detach an entire trait', () => {
		const { parent, childA, childB } = getTree();
		const startingView = RevisionView.fromTree(parent).openForTransaction();
		const { view, detached } = detachRange(
			startingView,
			StableRange.all({ parent: parent.identifier, label: traitLabel })
		);
		expect(detached).deep.equals([childA.identifier, childB.identifier]);
		expect(view.size).to.equal(3);
		expect(view.hasNode(childA.identifier)).to.be.true;
		expect(view.hasNode(childB.identifier)).to.be.true;
		expect(view.tryGetParentViewNode(childA.identifier)).to.be.undefined;
		expect(view.tryGetParentViewNode(childB.identifier)).to.be.undefined;
	});

	it('can insert a node', () => {
		const { parent, childA, childB } = getTree();
		const startingView = RevisionView.fromTree(parent).openForTransaction();
		const newNode = testTree.buildLeaf(testTree.generateNodeId());
		let view = startingView.addNodes([{ ...newNode, traits: new Map() }]);
		expect(view.size).to.equal(4);
		expect(view.hasNode(newNode.identifier)).to.be.true;
		expect(view.tryGetParentViewNode(newNode.identifier)).to.be.undefined;
		view = insertIntoTrait(
			view,
			[newNode.identifier],
			StablePlace.atStartOf({ parent: parent.identifier, label: traitLabel })
		);
		expect(view.tryGetParentViewNode(newNode.identifier)?.identifier).to.equal(parent.identifier);
		expect(view.getIndexInTrait(newNode.identifier)).to.equal(0);
		expect(view.getIndexInTrait(childA.identifier)).to.equal(1);
		expect(view.getIndexInTrait(childB.identifier)).to.equal(2);
	});
});
