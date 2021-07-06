/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Definition, NodeId, TraitLabel } from '../Identifiers';
import { Side, Snapshot } from '../Snapshot';
import { EditValidationResult } from '../Checkout';
import { detachRange, insertIntoTrait, StablePlace, StableRange, validateStableRange } from '../default-edits';
import { ChangeNode } from '../generic';
import {
	simpleTreeSnapshotWithValidation,
	left,
	right,
	leftTraitLocation,
	makeEmptyNode,
	makeTestNode,
} from './utilities/TestUtilities';

describe('Snapshot', () => {
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

			const snapshot = Snapshot.fromTree(node);
			expect(snapshot.getChangeNode(nodeId).traits.trait[0].identifier).to.equal(testNode.identifier);
			expect(snapshot.getChangeNode(nodeId).traits.emptyTrait).to.equal(undefined);
		});
	});

	describe('StableRange validation', () => {
		it('is malformed when anchors are malformed', () => {
			expect(
				validateStableRange(simpleTreeSnapshotWithValidation, {
					// trait and sibling should be mutually exclusive
					start: { referenceTrait: leftTraitLocation, referenceSibling: left.identifier, side: Side.Before },
					end: { referenceSibling: left.identifier, side: Side.After },
				})
			).equals(EditValidationResult.Malformed);
		});
		it('is invalid when anchors are incorrectly ordered', () => {
			expect(
				validateStableRange(simpleTreeSnapshotWithValidation, {
					start: { referenceSibling: left.identifier, side: Side.After },
					end: { referenceSibling: left.identifier, side: Side.Before },
				})
			).equals(EditValidationResult.Invalid);
		});
		it('is invalid when anchors are in different traits', () => {
			expect(
				validateStableRange(simpleTreeSnapshotWithValidation, {
					start: { referenceSibling: left.identifier, side: Side.Before },
					end: { referenceSibling: right.identifier, side: Side.After },
				})
			).equals(EditValidationResult.Invalid);
		});
		it('is invalid when an anchor is invalid', () => {
			expect(
				validateStableRange(simpleTreeSnapshotWithValidation, {
					start: { referenceSibling: '49a7e636-71ed-45f1-a1a8-2b8f2e7e84a3' as NodeId, side: Side.Before },
					end: { referenceSibling: right.identifier, side: Side.After },
				})
			).equals(EditValidationResult.Invalid);
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
		const startingSnapshot = Snapshot.fromTree(tree, true);
		it('can detach a single node', () => {
			expect(startingSnapshot.getIndexInTrait(nodeA.identifier)).to.equal(0);
			expect(startingSnapshot.getIndexInTrait(nodeB.identifier)).to.equal(1);
			const { snapshot } = detachRange(startingSnapshot, StableRange.only(nodeA));
			expect(snapshot.size).to.equal(3);
			expect(snapshot.hasNode(nodeA.identifier)).to.be.true;
			expect(snapshot.getParentSnapshotNode(nodeA.identifier)).to.be.undefined;
			expect(snapshot.getParentSnapshotNode(nodeB.identifier)?.identifier).to.equal(tree.identifier);
			expect(snapshot.getIndexInTrait(nodeB.identifier)).to.equal(0);
		});
		it('can detach an entire trait', () => {
			const { snapshot, detached } = detachRange(
				startingSnapshot,
				StableRange.all({ parent: tree.identifier, label })
			);
			expect(detached).deep.equals([nodeA.identifier, nodeB.identifier]);
			expect(snapshot.size).to.equal(3);
			expect(snapshot.hasNode(nodeA.identifier)).to.be.true;
			expect(snapshot.hasNode(nodeB.identifier)).to.be.true;
			expect(snapshot.getParentSnapshotNode(nodeA.identifier)).to.be.undefined;
			expect(snapshot.getParentSnapshotNode(nodeB.identifier)).to.be.undefined;
		});
		it('can insert a node', () => {
			const newNode = makeEmptyNode();
			let snapshot = startingSnapshot.addNodes([{ ...newNode, traits: new Map() }]);
			expect(snapshot.size).to.equal(4);
			expect(snapshot.hasNode(newNode.identifier)).to.be.true;
			expect(snapshot.getParentSnapshotNode(newNode.identifier)).to.be.undefined;
			snapshot = insertIntoTrait(
				snapshot,
				[newNode.identifier],
				StablePlace.atStartOf({ parent: tree.identifier, label })
			);
			expect(snapshot.getParentSnapshotNode(newNode.identifier)?.identifier).to.equal(tree.identifier);
			expect(snapshot.getIndexInTrait(newNode.identifier)).to.equal(0);
			expect(snapshot.getIndexInTrait(nodeA.identifier)).to.equal(1);
			expect(snapshot.getIndexInTrait(nodeB.identifier)).to.equal(2);
		});
	});
});
