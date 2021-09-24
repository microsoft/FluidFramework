/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { DetachedSequenceId, NodeId, TraitLabel } from '../Identifiers';
import { EditStatus } from '../generic';
import {
	Transaction,
	Change,
	ChangeType,
	ConstraintEffect,
	Insert,
	StableRange,
	StablePlace,
	RangeValidationResultKind,
	PlaceValidationResult,
} from '../default-edits';
import { Side } from '../TreeView';
import { assert } from '../Common';
import { initialTree } from '../InitialTree';
import {
	makeEmptyNode,
	testTrait,
	left,
	leftTraitLocation,
	right,
	rightTraitLocation,
	leftTraitLabel,
	rightTraitLabel,
	simpleRevisionViewWithValidation,
	initialRevisionViewWithValidation,
	initialRevisionView,
} from './utilities/TestUtilities';

describe('Transaction', () => {
	describe('Constraints', () => {
		it('can be met', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
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
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: invalidStableRange,
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint as ChangeType.Constraint,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: Transaction.ConstraintViolationKind.BadRange,
					rangeFailure: {
						kind: RangeValidationResultKind.BadPlace,
						place: invalidStableRange.start,
						placeFailure: PlaceValidationResult.MissingSibling,
					},
				},
			});
		});
		it('effect can apply anyway', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				toConstrain: invalidStableRange,
				effect: ConstraintEffect.ValidRetry,
				type: ChangeType.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be met', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				length: 0,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be unmet', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint as ChangeType.Constraint,
				length: 1,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: Transaction.ConstraintViolationKind.BadLength,
					actual: 0,
				},
			});
		});
		it('parent can be met', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				parentNode: initialRevisionView.root,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('parent can be unmet', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint as ChangeType.Constraint,
				parentNode: nonExistentNode,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: Transaction.ConstraintViolationKind.BadParent,
					actual: initialTree.identifier,
				},
			});
		});
		it('label can be met', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint,
				label: testTrait.label,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('label can be unmet', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeType.Constraint as ChangeType.Constraint,
				label: '7969ee2e-5418-43db-929a-4e9a23c5499d' as TraitLabel,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: Transaction.ConstraintViolationKind.BadLabel,
					actual: testTrait.label,
				},
			});
		});
	});

	describe('SetValue', () => {
		it('can be invalid if the node does not exist', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const change = {
				nodeToModify: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId,
				payload: {},
				type: ChangeType.SetValue as ChangeType.SetValue,
			};
			transaction.applyChange(change);

			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.UnknownId,
				change,
				id: change.nodeToModify,
			});
		});

		it('can change payload', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const payload = { foo: {} };
			transaction.applyChange({
				nodeToModify: initialRevisionView.root,
				payload, // Arbitrary payload.
				type: ChangeType.SetValue,
			});
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getViewNode(initialRevisionView.root).payload).deep.equals(payload);
		});

		// 'null' is not included here since it means clear the payload in setValue.
		for (const payload of [0, '', [], {}]) {
			it(`can set payload to ${JSON.stringify(payload)}`, () => {
				const transaction = Transaction.factory(initialRevisionViewWithValidation);
				transaction.applyChange({
					nodeToModify: initialRevisionView.root,
					payload,
					type: ChangeType.SetValue,
				});
				expect(transaction.status).equals(EditStatus.Applied);
				expect(transaction.view.getViewNode(initialRevisionView.root).payload).equals(payload);
			});
		}

		it('can clear an unset payload', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange(Change.clearPayload(initialRevisionView.root));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getViewNode(initialRevisionView.root), 'payload')).false;
			expect({}.hasOwnProperty.call(transaction.view.getChangeNode(initialRevisionView.root), 'payload')).false;
		});

		it('can clear a set payload', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				nodeToModify: initialRevisionView.root,
				payload: {},
				type: ChangeType.SetValue,
			});

			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getViewNode(initialRevisionView.root).payload).not.undefined;
			transaction.applyChange(Change.clearPayload(initialRevisionView.root));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getViewNode(initialRevisionView.root), 'payload')).false;
			expect({}.hasOwnProperty.call(transaction.view.getChangeNode(initialRevisionView.root), 'payload')).false;
		});
	});

	describe('Insert', () => {
		const buildId = 0 as DetachedSequenceId;
		const builtNodeId = uuidv4() as NodeId;
		const newNode = makeEmptyNode(builtNodeId);
		describe('can be malformed', () => {
			it('when the detached sequence ID is bogus', () => {
				const transaction = Transaction.factory(simpleRevisionViewWithValidation);
				transaction.applyChange(Change.build([newNode], buildId));
				const change = Change.insert(
					// Non-existent detached id
					1 as DetachedSequenceId,
					{ referenceSibling: initialRevisionView.root, side: Side.After }
				);
				transaction.applyChange(change);
				expect(transaction.status).equals(EditStatus.Malformed);
				const result = transaction.close();
				assert(result.status === EditStatus.Malformed);
				expect(result.failure).deep.equals({
					kind: Transaction.FailureKind.DetachedSequenceNotFound,
					change,
					sequenceId: change.source,
				});
			});
			it('when the target place is malformed', () => {
				const transaction = Transaction.factory(simpleRevisionViewWithValidation);
				transaction.applyChange(Change.build([newNode], buildId));
				const place = {
					referenceTrait: leftTraitLocation,
					referenceSibling: initialRevisionView.root,
					side: Side.After,
				};
				const change = Change.insert(buildId, place);
				transaction.applyChange(change);
				expect(transaction.status).equals(EditStatus.Malformed);
				const result = transaction.close();
				assert(result.status === EditStatus.Malformed);
				expect(result.failure).deep.equals({
					kind: Transaction.FailureKind.BadPlace,
					change,
					place,
					placeFailure: PlaceValidationResult.Malformed,
				});
			});
		});
		it('can be invalid when the target place is invalid', () => {
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			transaction.applyChange(Change.build([newNode], buildId));
			// Arbitrary id not present in the tree
			const place = { referenceSibling: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId, side: Side.After };
			const change = Change.insert(buildId, place);
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.BadPlace,
				change,
				place,
				placeFailure: PlaceValidationResult.MissingSibling,
			});
		});
		[Side.Before, Side.After].forEach((side) => {
			it(`can insert a node at the ${side === Side.After ? 'beginning' : 'end'} of a trait`, () => {
				const transaction = Transaction.factory(simpleRevisionViewWithValidation);
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
				const transaction = Transaction.factory(simpleRevisionViewWithValidation);
				transaction.applyChanges(Insert.create([newNode], { referenceSibling: left.identifier, side }));
				expect(transaction.view.getTrait(leftTraitLocation)).deep.equals(
					side === Side.Before ? [builtNodeId, left.identifier] : [left.identifier, builtNodeId]
				);
			});
		});
	});

	describe('Build', () => {
		it('can be malformed due to detached ID collision', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			// Apply two Build_s with the same detached id
			transaction.applyChange(Change.build([makeEmptyNode()], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const change = Change.build([makeEmptyNode()], 0 as DetachedSequenceId);
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.DetachedSequenceIdAlreadyInUse,
				change,
				sequenceId: change.destination,
			});
		});
		it('can be malformed due to duplicate node identifiers', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			// Build two nodes with the same identifier, one of them nested
			const newNode = makeEmptyNode();
			const change = Change.build(
				[
					newNode,
					{
						...makeEmptyNode(),
						traits: { [leftTraitLabel]: [{ ...makeEmptyNode(), identifier: newNode.identifier }] },
					},
				],
				0 as DetachedSequenceId
			);
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.DuplicateIdInBuild,
				change,
				id: newNode.identifier,
			});
		});
		it('can be invalid when a node already exists with the given identifier', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			// Build two nodes with the same identifier
			const identifier = uuidv4() as NodeId;
			transaction.applyChange(Change.build([makeEmptyNode(identifier)], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const change = Change.build([makeEmptyNode(identifier)], 1 as DetachedSequenceId);
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.IdAlreadyInUse,
				change,
				id: identifier,
			});
		});
		it('can build a detached node', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const identifier = uuidv4() as NodeId;
			const newNode = makeEmptyNode(identifier);
			transaction.applyChange(Change.build([newNode], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.hasNode(identifier)).is.true;
			expect(transaction.view.getParentViewNode(identifier)).is.undefined;
			expect(transaction.view.getChangeNode(identifier)).deep.equals(newNode);
		});
		it("can be malformed if detached sequence id doesn't exist", () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const detachedSequenceId = 0 as DetachedSequenceId;
			const change = {
				destination: 1 as DetachedSequenceId,
				source: [detachedSequenceId],
				type: ChangeType.Build as ChangeType.Build,
			};
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.DetachedSequenceNotFound,
				change,
				sequenceId: detachedSequenceId,
			});
		});
		it('can build a node with an explicit empty trait', () => {
			// Forest should strip off the empty trait
			const nodeWithEmpty = makeEmptyNode();
			const traits = new Map<TraitLabel, NodeId[]>();
			const emptyTrait: NodeId[] = [];
			traits.set(leftTraitLabel, emptyTrait);

			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const detachedSequenceId = 0 as DetachedSequenceId;
			transaction.applyChange(Change.build([nodeWithEmpty], detachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const viewNodeWithEmpty = transaction.view.getViewNode(nodeWithEmpty.identifier);
			expect(viewNodeWithEmpty.traits.size).to.equal(0);
		});
	});

	describe('Detach', () => {
		it('can be malformed if the target range is malformed', () => {
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			const place = { referenceTrait: leftTraitLocation, referenceSibling: left.identifier, side: Side.Before };
			const range = {
				start: place,
				end: StablePlace.after(right),
			};
			const change = Change.detach(range);
			// Supplied StableRange is malformed
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.BadRange,
				change,
				range,
				rangeFailure: {
					kind: RangeValidationResultKind.BadPlace,
					place,
					placeFailure: PlaceValidationResult.Malformed,
				},
			});
		});
		it('can be malformed if the destination sequence id is already in use', () => {
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			transaction.applyChange(Change.detach(StableRange.only(left), 0 as DetachedSequenceId));
			const change = Change.detach(StableRange.only(right), 0 as DetachedSequenceId);
			// Supplied StableRange is malformed
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.DetachedSequenceIdAlreadyInUse,
				change,
				sequenceId: change.destination,
			});
		});
		it('can be invalid if the target range is invalid', () => {
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			const range = {
				start: StablePlace.atEndOf(leftTraitLocation),
				end: StablePlace.atStartOf(leftTraitLocation),
			};
			const change = Change.detach(range);
			// Start place is before end place
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: Transaction.FailureKind.BadRange,
				change,
				range,
				rangeFailure: RangeValidationResultKind.Inverted,
			});
		});
		it('can delete a node', () => {
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			transaction.applyChange(Change.detach(StableRange.only(left)));
			expect(transaction.view.hasNode(left.identifier)).is.false;
		});
	});

	describe('Composite changes', () => {
		it('can form a node move', () => {
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			const detachedId = 0 as DetachedSequenceId;
			transaction.applyChange(Change.detach(StableRange.only(left), detachedId));
			transaction.applyChange(Change.insert(detachedId, StablePlace.after(right)));
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(rightTraitLocation)).deep.equals([right.identifier, left.identifier]);
		});
		it('can form a wrap insert', () => {
			// A wrap insert is an edit that inserts a new node between a subtree and its parent atomically.
			// Ex: given A -> B -> C, a wrap insert of D around B would produce A -> D -> B -> C
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
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
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
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
			const transaction = Transaction.factory(simpleRevisionViewWithValidation);
			transaction.applyChange(Change.detach(StableRange.only(left)));
			const idOfDetachedNodeToInsert = 1 as DetachedSequenceId;
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([]);
			transaction.applyChange(Change.build([makeEmptyNode(left.identifier)], idOfDetachedNodeToInsert));
			transaction.applyChange(Change.insert(idOfDetachedNodeToInsert, StablePlace.atStartOf(leftTraitLocation)));
			expect(transaction.view.getTrait(leftTraitLocation)).deep.equals([left.identifier]);
		});
	});
});
