/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { DetachedSequenceId, NodeId, TraitLabel } from '../Identifiers';
import { EditStatus } from '../generic';
import { Transaction, Change, ChangeType, ConstraintEffect, Insert, StableRange, StablePlace } from '../default-edits';
import { Side } from '../Snapshot';
import {
	makeEmptyNode,
	testTrait,
	left,
	leftTraitLocation,
	right,
	rightTraitLocation,
	leftTraitLabel,
	rightTraitLabel,
	simpleTreeSnapshotWithValidation,
	initialSnapshotWithValidation,
	initialSnapshot,
} from './utilities/TestUtilities';

describe('Transaction', () => {
	describe('Constraints', () => {
		it('can be met', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		const nonExistentNode = '57dd2fc4-72fa-471c-9f37-70010d31b59c' as NodeId;
		const invalidStableRange: StableRange = {
			start: { side: Side.After, referenceSibling: nonExistentNode },
			end: { side: Side.Before },
		};
		it('can be unmet', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: invalidStableRange,
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Invalid);
		});
		it('effect can apply anyway', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: invalidStableRange,
				effect: ConstraintEffect.ValidRetry,
				type: ChangeType.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be met', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				length: 0,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be unmet', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				length: 1,
			});
			expect(transaction.status).equals(EditStatus.Invalid);
		});
		it('parent can be met', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				parentNode: initialSnapshot.root,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('parent can be unmet', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				parentNode: nonExistentNode,
			});
			expect(transaction.status).equals(EditStatus.Invalid);
		});
		it('label can be met', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				label: testTrait.label,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('label can be unmet', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				label: '7969ee2e-5418-43db-929a-4e9a23c5499d' as TraitLabel, // Arbitrary label not equal to testTrait.label
			});
			expect(transaction.status).equals(EditStatus.Invalid);
		});
	});

	describe('SetValue', () => {
		it('can be invalid', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				nodeToModify: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId, // Arbitrary id not equal to initialSnapshot.root
				payload: {}, // Arbitrary payload.
				type: ChangeType.SetValue,
			});
			expect(transaction.status).equals(EditStatus.Invalid);
		});

		it('can change payload', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			const payload = { foo: {} };
			transaction.applyChange({
				nodeToModify: initialSnapshot.root,
				payload, // Arbitrary payload.
				type: ChangeType.SetValue,
			});
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getSnapshotNode(initialSnapshot.root).payload).deep.equals(payload);
		});

		// 'null' is not included here since it means clear the payload in setValue.
		for (const payload of [0, '', [], {}]) {
			it(`can set payload to ${JSON.stringify(payload)}`, () => {
				const transaction = new Transaction(initialSnapshotWithValidation);
				transaction.applyChange({
					nodeToModify: initialSnapshot.root,
					payload,
					type: ChangeType.SetValue,
				});
				expect(transaction.status).equals(EditStatus.Applied);
				expect(transaction.view.getSnapshotNode(initialSnapshot.root).payload).equals(payload);
			});
		}

		it('can clear an unset payload', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange(Change.clearPayload(initialSnapshot.root));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getSnapshotNode(initialSnapshot.root), 'payload')).false;
			expect({}.hasOwnProperty.call(transaction.view.getChangeNode(initialSnapshot.root), 'payload')).false;
		});

		it('can clear a set payload', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			transaction.applyChange({
				nodeToModify: initialSnapshot.root,
				payload: {},
				type: ChangeType.SetValue,
			});

			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getSnapshotNode(initialSnapshot.root).payload).not.undefined;
			transaction.applyChange(Change.clearPayload(initialSnapshot.root));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getSnapshotNode(initialSnapshot.root), 'payload')).false;
			expect({}.hasOwnProperty.call(transaction.view.getChangeNode(initialSnapshot.root), 'payload')).false;
		});
	});

	describe('Insert', () => {
		const buildId = 0 as DetachedSequenceId;
		const builtNodeId = uuidv4() as NodeId;
		const newNode = makeEmptyNode(builtNodeId);
		it('can be malformed', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			transaction.applyChange(Change.build([newNode], buildId));
			transaction.applyChange(
				Change.insert(
					// Non-existent detached id
					1 as DetachedSequenceId,
					{ referenceSibling: initialSnapshot.root, side: Side.After }
				)
			);
			expect(transaction.status).equals(EditStatus.Malformed);
		});
		it('can be invalid', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			transaction.applyChange(Change.build([newNode], buildId));
			transaction.applyChange(
				Change.insert(
					buildId,
					// Arbitrary id not present in the tree
					{ referenceSibling: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId, side: Side.After }
				)
			);
			expect(transaction.status).equals(EditStatus.Invalid);
		});
		[Side.Before, Side.After].forEach((side) => {
			it(`can insert a node at the ${side === Side.After ? 'beginning' : 'end'} of a trait`, () => {
				const transaction = new Transaction(simpleTreeSnapshotWithValidation);
				transaction.applyChanges(
					Insert.create(
						[newNode],
						side === Side.After
							? StablePlace.atStartOf(leftTraitLocation)
							: StablePlace.atEndOf(leftTraitLocation)
					)
				);
				expect(transaction.view.getTrait(leftTraitLocation)).deep.equals(
					side === Side.After ? [builtNodeId, left.identifier] : [left.identifier, builtNodeId]
				);
			});
			it(`can insert a node ${side === Side.Before ? 'before' : 'after'} another node`, () => {
				const transaction = new Transaction(simpleTreeSnapshotWithValidation);
				transaction.applyChanges(Insert.create([newNode], { referenceSibling: left.identifier, side }));
				expect(transaction.view.getTrait(leftTraitLocation)).deep.equals(
					side === Side.Before ? [builtNodeId, left.identifier] : [left.identifier, builtNodeId]
				);
			});
		});
	});

	describe('Build', () => {
		it('can be malformed due to detached ID collision', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			// Apply two Build_s with the same detached id
			transaction.applyChange(Change.build([makeEmptyNode()], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			transaction.applyChange(Change.build([makeEmptyNode()], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Malformed);
		});
		it('can be malformed due to duplicate node identifiers', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			// Build two nodes with the same identifier, one of them nested
			const newNode = makeEmptyNode();
			transaction.applyChange(
				Change.build(
					[
						newNode,
						{
							...makeEmptyNode(),
							traits: { [leftTraitLabel]: [{ ...makeEmptyNode(), identifier: newNode.identifier }] },
						},
					],
					0 as DetachedSequenceId
				)
			);
			expect(transaction.status).equals(EditStatus.Malformed);
		});
		it('can be invalid', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			// Build two nodes with the same identifier
			const identifier = uuidv4() as NodeId;
			transaction.applyChange(Change.build([makeEmptyNode(identifier)], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			transaction.applyChange(Change.build([makeEmptyNode(identifier)], 1 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Invalid);
		});
		it('can build a detached node', () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			const identifier = uuidv4() as NodeId;
			const newNode = makeEmptyNode(identifier);
			transaction.applyChange(Change.build([newNode], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.hasNode(identifier)).is.true;
			expect(transaction.view.getParentSnapshotNode(identifier)).is.undefined;
			expect(transaction.view.getChangeNode(identifier)).deep.equals(newNode);
		});
		it("is malformed if detached node id doesn't exist", () => {
			const transaction = new Transaction(initialSnapshotWithValidation);
			const detachedSequenceId = 0 as DetachedSequenceId;
			transaction.applyChange({
				destination: 1 as DetachedSequenceId,
				source: [detachedSequenceId],
				type: ChangeType.Build,
			});
			expect(transaction.status).equals(EditStatus.Malformed);
		});
		it('can build a node with an explicit empty trait', () => {
			// Forest should strip off the empty trait
			const nodeWithEmpty = makeEmptyNode();
			const traits = new Map<TraitLabel, NodeId[]>();
			const emptyTrait: NodeId[] = [];
			traits.set(leftTraitLabel, emptyTrait);

			const transaction = new Transaction(initialSnapshotWithValidation);
			const detachedSequenceId = 0 as DetachedSequenceId;
			transaction.applyChange(Change.build([nodeWithEmpty], detachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const snapshotNodeWithEmpty = transaction.view.getSnapshotNode(nodeWithEmpty.identifier);
			expect(snapshotNodeWithEmpty.traits.size).to.equal(0);
		});
	});

	describe('Detach', () => {
		it('can be malformed', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			// Supplied StableRange is malformed
			transaction.applyChange(
				Change.detach({
					start: { referenceTrait: leftTraitLocation, referenceSibling: left.identifier, side: Side.Before },
					end: StablePlace.after(right),
				})
			);
			expect(transaction.status).equals(EditStatus.Malformed);
		});
		it('can be invalid', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			// Start place is before end place
			transaction.applyChange(
				Change.detach({
					start: StablePlace.atEndOf(leftTraitLocation),
					end: StablePlace.atStartOf(leftTraitLocation),
				})
			);
			expect(transaction.status).equals(EditStatus.Invalid);
		});
		it('can delete a node', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			transaction.applyChange(Change.detach(StableRange.only(left)));
			expect(transaction.view.hasNode(left.identifier)).is.false;
		});
	});

	describe('Composite changes', () => {
		it('can form a node move', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			const detachedId = 0 as DetachedSequenceId;
			transaction.applyChange(Change.detach(StableRange.only(left), detachedId));
			transaction.applyChange(Change.insert(detachedId, StablePlace.after(right)));
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(rightTraitLocation)).deep.equals([right.identifier, left.identifier]);
		});
		it('can form a wrap insert', () => {
			// A wrap insert is an edit that inserts a new node between a subtree and its parent atomically.
			// Ex: given A -> B -> C, a wrap insert of D around B would produce A -> D -> B -> C
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			const leftNodeDetachedId = 0 as DetachedSequenceId;
			const parentDetachedId = 1 as DetachedSequenceId;
			transaction.applyChange(Change.detach(StableRange.only(left), leftNodeDetachedId));
			// This is node D, from the example
			const wrappingParentId = uuidv4() as NodeId;
			const wrappingTraitLabel = 'wrapTrait' as TraitLabel;
			transaction.applyChange(
				Change.build(
					[
						{
							...makeEmptyNode(wrappingParentId),
							traits: { [wrappingTraitLabel]: [leftNodeDetachedId] }, // Re-parent left under new node
						},
					],
					parentDetachedId
				)
			);
			transaction.applyChange(Change.insert(parentDetachedId, StablePlace.atStartOf(leftTraitLocation)));
			const leftTrait = transaction.view.getTrait(leftTraitLocation);
			expect(leftTrait).deep.equals([wrappingParentId]);
			const wrappingTrait = transaction.view.getTrait({ parent: wrappingParentId, label: wrappingTraitLabel });
			expect(wrappingTrait).deep.equals([left.identifier]);
		});
		it('can build and insert a tree that contains detached subtrees', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			const leftNodeDetachedId = 0 as DetachedSequenceId;
			const rightNodeDetachedId = 1 as DetachedSequenceId;
			const detachedIdSubtree = 2 as DetachedSequenceId;
			transaction.applyChange(Change.detach(StableRange.only(left), leftNodeDetachedId));
			transaction.applyChange(Change.detach(StableRange.only(right), rightNodeDetachedId));

			const detachedSubtree = {
				...makeEmptyNode(),
				traits: {
					[leftTraitLabel]: [leftNodeDetachedId],
					[rightTraitLabel]: [rightNodeDetachedId],
				},
			};
			transaction.applyChange(Change.build([detachedSubtree], detachedIdSubtree));
			transaction.applyChange(Change.insert(detachedIdSubtree, StablePlace.atStartOf(leftTraitLocation)));
			expect(transaction.view.getTrait(rightTraitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([detachedSubtree.identifier]);
			const insertedSubtree = transaction.view.getChangeNode(detachedSubtree.identifier);
			expect(insertedSubtree.traits).deep.equals({
				[leftTraitLabel]: [left],
				[rightTraitLabel]: [right],
			});
		});
		it('can build and insert a tree with the same identity as that of a detached subtree', () => {
			const transaction = new Transaction(simpleTreeSnapshotWithValidation);
			transaction.applyChange(Change.detach(StableRange.only(left)));
			const idOfDetachedNodeToInsert = 1 as DetachedSequenceId;
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([]);
			transaction.applyChange(Change.build([makeEmptyNode(left.identifier)], idOfDetachedNodeToInsert));
			transaction.applyChange(Change.insert(idOfDetachedNodeToInsert, StablePlace.atStartOf(leftTraitLocation)));
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([left.identifier]);
		});
	});
});
