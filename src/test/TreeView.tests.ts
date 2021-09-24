/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Definition, NodeId, TraitLabel } from '../Identifiers';
import { RevisionView } from '../TreeView';
import { detachRange, insertIntoTrait, StablePlace, StableRange } from '../default-edits';
import { ChangeNode } from '../generic';
import { makeEmptyNode, makeTestNode } from './utilities/TestUtilities';

describe('TreeView', () => {
	describe('creation from a ChangeNode', () => {
		it('ignores empty traits', () => {
			const nodeId = '46711f26-5a27-4a35-9f04-0602dd853b43' as NodeId;
			const testNode = makeTestNode();
			const node: ChangeNode = {
				traits: {
					trait: [testNode],
					emptyTrait: [],
				},
				definition: '9f9f7fd1-780b-4d78-bca7-2342df4523f2' as Definition,
				identifier: nodeId,
			};

			const view = RevisionView.fromTree(node);
			expect(view.getChangeNode(nodeId).traits.trait[0].identifier).to.equal(testNode.identifier);
			expect(view.getChangeNode(nodeId).traits.emptyTrait).to.equal(undefined);
		});
	});

	describe('Mutators', () => {
		const label = 'label' as TraitLabel;
		const nodeA = makeEmptyNode();
		const nodeB = makeEmptyNode();
		const tree: ChangeNode = {
			...makeEmptyNode(),
			traits: { [label]: [nodeA, nodeB] },
		};
		const startingView = RevisionView.fromTree(tree, true).openForTransaction();
		it('can detach a single node', () => {
			expect(startingView.getIndexInTrait(nodeA.identifier)).to.equal(0);
			expect(startingView.getIndexInTrait(nodeB.identifier)).to.equal(1);
			const { view } = detachRange(startingView, StableRange.only(nodeA));
			expect(view.size).to.equal(3);
			expect(view.hasNode(nodeA.identifier)).to.be.true;
			expect(view.getParentViewNode(nodeA.identifier)).to.be.undefined;
			expect(view.getParentViewNode(nodeB.identifier)?.identifier).to.equal(tree.identifier);
			expect(view.getIndexInTrait(nodeB.identifier)).to.equal(0);
		});
		it('can detach an entire trait', () => {
			const { view, detached } = detachRange(startingView, StableRange.all({ parent: tree.identifier, label }));
			expect(detached).deep.equals([nodeA.identifier, nodeB.identifier]);
			expect(view.size).to.equal(3);
			expect(view.hasNode(nodeA.identifier)).to.be.true;
			expect(view.hasNode(nodeB.identifier)).to.be.true;
			expect(view.getParentViewNode(nodeA.identifier)).to.be.undefined;
			expect(view.getParentViewNode(nodeB.identifier)).to.be.undefined;
		});
		it('can insert a node', () => {
			const newNode = makeEmptyNode();
			let view = startingView.addNodes([{ ...newNode, traits: new Map() }]);
			expect(view.size).to.equal(4);
			expect(view.hasNode(newNode.identifier)).to.be.true;
			expect(view.getParentViewNode(newNode.identifier)).to.be.undefined;
			view = insertIntoTrait(
				view,
				[newNode.identifier],
				StablePlace.atStartOf({ parent: tree.identifier, label })
			);
			expect(view.getParentViewNode(newNode.identifier)?.identifier).to.equal(tree.identifier);
			expect(view.getIndexInTrait(newNode.identifier)).to.equal(0);
			expect(view.getIndexInTrait(nodeA.identifier)).to.equal(1);
			expect(view.getIndexInTrait(nodeB.identifier)).to.equal(2);
		});
	});
});
