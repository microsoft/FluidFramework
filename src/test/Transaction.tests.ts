/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { DetachedSequenceId, NodeId, TraitLabel } from '../Identifiers';
import {
	Change,
	StableRange,
	Side,
	ChangeType,
	ConstraintEffect,
	EditResult,
	Insert,
	StablePlace,
} from '../PersistedTypes';
import { initialTree } from '../InitialTree';
import {
	makeEmptyNode,
	testTrait,
	simpleTreeSnapshot,
	left,
	leftTraitLocation,
	initialSnapshot,
	right,
	rightTraitLocation,
} from './utilities/TestUtilities';
import { Transaction } from '../Transaction';

describe('Transaction', () => {
	describe('Constraints', () => {
		it('can be met', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
			});
			expect(transaction.result).equals(EditResult.Applied);
		});
		const nonExistentNode = '57dd2fc4-72fa-471c-9f37-70010d31b59c' as NodeId;
		const invalidStableRange: StableRange = {
			start: { side: Side.After, referenceSibling: nonExistentNode },
			end: { side: Side.Before },
		};
		it('can be unmet', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: invalidStableRange,
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
			});
			expect(transaction.result).equals(EditResult.Invalid);
		});
		it('effect can apply anyway', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: invalidStableRange,
				effect: ConstraintEffect.ValidRetry,
				type: ChangeType.Constraint,
			});
			expect(transaction.result).equals(EditResult.Applied);
		});
		it('length can be met', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				length: 0,
			});
			expect(transaction.result).equals(EditResult.Applied);
		});
		it('length can be unmet', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				length: 1,
			});
			expect(transaction.result).equals(EditResult.Invalid);
		});
		it('parent can be met', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				parentNode: initialTree.identifier,
			});
			expect(transaction.result).equals(EditResult.Applied);
		});
		it('parent can be unmet', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				parentNode: nonExistentNode,
			});
			expect(transaction.result).equals(EditResult.Invalid);
		});
		it('label can be met', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				label: testTrait.label,
			});
			expect(transaction.result).equals(EditResult.Applied);
		});
		it('label can be unmet', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				label: '7969ee2e-5418-43db-929a-4e9a23c5499d' as TraitLabel, // Arbitrary label not equal to testTrait.label
			});
			expect(transaction.result).equals(EditResult.Invalid);
		});
	});

	describe('SetValue', () => {
		it('can be invalid', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				nodeToModify: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId, // Arbitrary id not equal to initialTree.identifier
				payload: { base64: 'eg==' }, // Arbitrary valid base64 string.
				type: ChangeType.SetValue,
			});
			expect(transaction.result).equals(EditResult.Invalid);
		});

		it('can change payload', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				nodeToModify: initialTree.identifier,
				payload: { base64: 'eg==' }, // Arbitrary valid base64 string.
				type: ChangeType.SetValue,
			});
			expect(transaction.result).equals(EditResult.Applied);
			expect(transaction.view.getSnapshotNode(initialTree.identifier).payload?.base64).equals('eg==');
		});

		it('can set empty payload', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				nodeToModify: initialTree.identifier,
				payload: { base64: '' },
				type: ChangeType.SetValue,
			});
			expect(transaction.result).equals(EditResult.Applied);
			expect(transaction.view.getSnapshotNode(initialTree.identifier).payload?.base64).equals('');
		});

		it('can clear an unset payload', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange(Change.clearPayload(initialTree.identifier));
			expect(transaction.result).equals(EditResult.Applied);
			expect(transaction.view.getSnapshotNode(initialTree.identifier).payload).undefined;
		});

		it('can clear a set payload', () => {
			const transaction = new Transaction(initialSnapshot);
			transaction.applyChange({
				nodeToModify: initialTree.identifier,
				payload: { base64: '' },
				type: ChangeType.SetValue,
			});

			expect(transaction.result).equals(EditResult.Applied);
			expect(transaction.view.getSnapshotNode(initialTree.identifier).payload).not.undefined;
			transaction.applyChange(Change.clearPayload(initialTree.identifier));
			expect(transaction.result).equals(EditResult.Applied);
			expect(transaction.view.getSnapshotNode(initialTree.identifier).payload).undefined;
		});
	});

	describe('Insert', () => {
		const buildId = 0 as DetachedSequenceId;
		const builtNodeId = uuidv4() as NodeId;
		const newNode = makeEmptyNode(builtNodeId);
		it('can be malformed', () => {
			const transaction = new Transaction(simpleTreeSnapshot);
			transaction.applyChange(Change.build([newNode], buildId));
			transaction.applyChange(
				Change.insert(
					// Non-existent detached id
					1 as DetachedSequenceId,
					{ referenceSibling: initialTree.identifier, side: Side.After }
				)
			);
			expect(transaction.result).equals(EditResult.Malformed);
		});
		it('can be invalid', () => {
			const transaction = new Transaction(simpleTreeSnapshot);
			transaction.applyChange(Change.build([newNode], buildId));
			transaction.applyChange(
				Change.insert(
					buildId,
					// Arbitrary id not present in the tree
					{ referenceSibling: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId, side: Side.After }
				)
			);
			expect(transaction.result).equals(EditResult.Invalid);
		});
		[Side.Before, Side.After].forEach((side) => {
			it(`can insert a node at the ${side === Side.After ? 'beginning' : 'end'} of a trait`, () => {
				const transaction = new Transaction(simpleTreeSnapshot);
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
				const transaction = new Transaction(simpleTreeSnapshot);
				transaction.applyChanges(Insert.create([newNode], { referenceSibling: left.identifier, side }));
				expect(transaction.view.getTrait(leftTraitLocation)).deep.equals(
					side === Side.Before ? [builtNodeId, left.identifier] : [left.identifier, builtNodeId]
				);
			});
		});
	});

	describe('Build', () => {
		it('can be malformed', () => {
			const transaction = new Transaction(initialSnapshot);
			// Build two nodes with the same detached id
			transaction.applyChange(Change.build([makeEmptyNode()], 0 as DetachedSequenceId));
			expect(transaction.result).equals(EditResult.Applied);
			transaction.applyChange(Change.build([makeEmptyNode()], 0 as DetachedSequenceId));
			expect(transaction.result).equals(EditResult.Malformed);
		});
		it('can be invalid', () => {
			const transaction = new Transaction(initialSnapshot);
			// Build two nodes with the same identifier
			const identifier = uuidv4() as NodeId;
			transaction.applyChange(Change.build([makeEmptyNode(identifier)], 0 as DetachedSequenceId));
			expect(transaction.result).equals(EditResult.Applied);
			transaction.applyChange(Change.build([makeEmptyNode(identifier)], 1 as DetachedSequenceId));
			expect(transaction.result).equals(EditResult.Invalid);
		});
		it('can build a detached node', () => {
			const transaction = new Transaction(initialSnapshot);
			const identifier = uuidv4() as NodeId;
			transaction.applyChange(Change.build([makeEmptyNode(identifier)], 0 as DetachedSequenceId));
			expect(transaction.result).equals(EditResult.Applied);
			expect(transaction.view.hasNode(identifier)).is.true;
			expect(transaction.view.getParentSnapshotNode(identifier)).is.undefined;
		});
		it("is malformed if detached node id doesn't exist", () => {
			const transaction = new Transaction(initialSnapshot);
			const editNode = 0 as DetachedSequenceId;
			transaction.applyChange({
				destination: 1 as DetachedSequenceId,
				source: [editNode],
				type: ChangeType.Build,
			});
			expect(transaction.result).equals(EditResult.Malformed);
		});
	});

	describe('Detach', () => {
		it('can be malformed', () => {
			const transaction = new Transaction(simpleTreeSnapshot);
			// Supplied StableRange is malformed
			transaction.applyChange(
				Change.detach({
					start: { referenceTrait: leftTraitLocation, referenceSibling: left.identifier, side: Side.Before },
					end: StablePlace.after(right),
				})
			);
			expect(transaction.result).equals(EditResult.Malformed);
		});
		it('can be invalid', () => {
			const transaction = new Transaction(simpleTreeSnapshot);
			// Start place is before end place
			transaction.applyChange(
				Change.detach({
					start: StablePlace.atEndOf(leftTraitLocation),
					end: StablePlace.atStartOf(leftTraitLocation),
				})
			);
			expect(transaction.result).equals(EditResult.Invalid);
		});
		it('can delete a node', () => {
			const transaction = new Transaction(simpleTreeSnapshot);
			transaction.applyChange(Change.detach(StableRange.only(left)));
			expect(transaction.view.hasNode(left.identifier)).is.false;
		});
	});

	describe('Composite changes', () => {
		it('can form a node move', () => {
			const transaction = new Transaction(simpleTreeSnapshot);
			const detachedId = 0 as DetachedSequenceId;
			transaction.applyChange(Change.detach(StableRange.only(left), detachedId));
			transaction.applyChange(Change.insert(detachedId, StablePlace.after(right)));
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(rightTraitLocation)).deep.equals([right.identifier, left.identifier]);
		});
		it('can form a wrap insert', () => {
			// A wrap insert is an edit that inserts a new node between a subtree and its parent atomically.
			// Ex: given A -> B -> C, a wrap insert of D around B would produce A -> D -> B -> C
			const transaction = new Transaction(simpleTreeSnapshot);
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
	});
});
