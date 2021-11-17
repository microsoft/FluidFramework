/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { DetachedSequenceId, NodeId, TraitLabel } from '../Identifiers';
import { ChangeNode, EditStatus } from '../generic';
import {
	Transaction,
	ChangeInternal,
	ChangeTypeInternal,
	ConstraintEffect,
	StableRange,
	StablePlace,
	RangeValidationResultKind,
	PlaceValidationResult,
	InsertInternal,
} from '../default-edits';
import { Side } from '../TreeView';
import { assert } from '../Common';
import { initialTree } from '../InitialTree';
import {
	deepCompareNodes,
	initialRevisionView,
	initialRevisionViewWithValidation,
	refreshTestTree,
	testTrait,
} from './utilities/TestUtilities';
import { SimpleTestTree } from './utilities/TestNode';

describe('Transaction', () => {
	describe('Constraints', () => {
		it('can be met', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint,
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
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
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
				type: ChangeTypeInternal.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be met', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint,
				length: 0,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be unmet', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
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
				type: ChangeTypeInternal.Constraint,
				parentNode: initialRevisionView.root,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('parent can be unmet', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
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
				type: ChangeTypeInternal.Constraint,
				label: testTrait.label,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('label can be unmet', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			const constraint = {
				toConstrain: StableRange.all(testTrait),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
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
				type: ChangeTypeInternal.SetValue as ChangeTypeInternal.SetValue,
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
				type: ChangeTypeInternal.SetValue,
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
					type: ChangeTypeInternal.SetValue,
				});
				expect(transaction.status).equals(EditStatus.Applied);
				expect(transaction.view.getViewNode(initialRevisionView.root).payload).equals(payload);
			});
		}

		it('can clear an unset payload', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange(ChangeInternal.clearPayload(initialRevisionView.root));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getViewNode(initialRevisionView.root), 'payload')).false;
			expect({}.hasOwnProperty.call(transaction.view.getChangeNode(initialRevisionView.root), 'payload')).false;
		});

		it('can clear a set payload', () => {
			const transaction = Transaction.factory(initialRevisionViewWithValidation);
			transaction.applyChange({
				nodeToModify: initialRevisionView.root,
				payload: {},
				type: ChangeTypeInternal.SetValue,
			});

			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getViewNode(initialRevisionView.root).payload).not.undefined;
			transaction.applyChange(ChangeInternal.clearPayload(initialRevisionView.root));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getViewNode(initialRevisionView.root), 'payload')).false;
			expect({}.hasOwnProperty.call(transaction.view.getChangeNode(initialRevisionView.root), 'payload')).false;
		});
	});

	describe('Insert', () => {
		const testTree = refreshTestTree();

		const buildId = 0 as DetachedSequenceId;

		describe('can be malformed', () => {
			it('when the detached sequence ID is bogus', () => {
				const transaction = Transaction.factory(testTree.view);
				transaction.applyChange(ChangeInternal.build([testTree.buildLeaf()], buildId));
				const change = ChangeInternal.insert(
					// Non-existent detached id
					1 as DetachedSequenceId,
					{ referenceSibling: testTree.identifier, side: Side.After }
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
				const transaction = Transaction.factory(testTree.view);
				transaction.applyChange(ChangeInternal.build([testTree.buildLeaf()], buildId));
				const place: StablePlace = {
					referenceTrait: testTree.left.traitLocation,
					referenceSibling: testTree.identifier,
					side: Side.After,
				};
				const change = ChangeInternal.insert(buildId, place);
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
			const transaction = Transaction.factory(testTree.view);
			transaction.applyChange(ChangeInternal.build([testTree.buildLeaf()], buildId));
			// Arbitrary id not present in the tree
			const place = { referenceSibling: '7969ee2e-5418-43db-929a-4e9a23c5499d' as NodeId, side: Side.After };
			const change = ChangeInternal.insert(buildId, place);
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
				const transaction = Transaction.factory(testTree.view);
				const newNode = testTree.buildLeaf();
				const newNodeId = newNode.identifier;

				transaction.applyChanges(
					InsertInternal.create(
						[newNode],
						side === Side.After
							? StablePlace.atStartOf(testTree.left.traitLocation)
							: StablePlace.atEndOf(testTree.left.traitLocation)
					)
				);
				expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals(
					side === Side.After ? [newNodeId, testTree.left.identifier] : [testTree.left.identifier, newNodeId]
				);
			});
			it(`can insert a node ${side === Side.Before ? 'before' : 'after'} another node`, () => {
				const transaction = Transaction.factory(testTree.view);
				const newNode = testTree.buildLeaf();
				const newNodeId = newNode.identifier;

				transaction.applyChanges(
					InsertInternal.create([newNode], { referenceSibling: testTree.left.identifier, side })
				);
				expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals(
					side === Side.Before ? [newNodeId, testTree.left.identifier] : [testTree.left.identifier, newNodeId]
				);
			});
		});
	});

	describe('Build', () => {
		const testTree = refreshTestTree();

		it('can be malformed due to detached ID collision', () => {
			const transaction = Transaction.factory(testTree.view);
			// Apply two Build_s with the same detached id
			transaction.applyChange(ChangeInternal.build([testTree.buildLeaf()], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const change = ChangeInternal.build([testTree.buildLeaf()], 0 as DetachedSequenceId);
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
			const transaction = Transaction.factory(testTree.view);
			// Build two nodes with the same identifier, one of them nested
			const newNode = testTree.buildLeaf();
			const change = ChangeInternal.build(
				[
					newNode,
					{
						...testTree.buildLeaf(),
						traits: {
							[testTree.left.traitLabel]: [{ ...testTree.buildLeaf(), identifier: newNode.identifier }],
						},
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

		it('is invalid when a node already exists with the given identifier', () => {
			const transaction = Transaction.factory(testTree.view);
			// Build two nodes with the same identifier
			const identifier = testTree.generateId();
			const node1: ChangeNode = {
				identifier,
				definition: SimpleTestTree.definition,
				traits: {},
			};
			const node2: ChangeNode = {
				identifier,
				definition: SimpleTestTree.definition,
				traits: {},
			};

			transaction.applyChange(ChangeInternal.build([node1], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const change = ChangeInternal.build([node2], 1 as DetachedSequenceId);
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

		it('is invalid to build a node that has already been inserted', () => {
			const transaction = Transaction.factory(testTree.view);
			// Build new node using identifier already in use in the tree
			const newNode: ChangeNode = {
				identifier: testTree.left.identifier,
				definition: SimpleTestTree.definition,
				traits: {},
			};

			transaction.applyChange(ChangeInternal.build([newNode], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure.kind).equals(Transaction.FailureKind.IdAlreadyInUse);
		});

		it('can build a detached node', () => {
			const transaction = Transaction.factory(testTree.view);
			const newNode = testTree.buildLeaf();
			const identifier = newNode.identifier;
			transaction.applyChange(ChangeInternal.build([newNode], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.hasNode(identifier)).is.true;
			expect(transaction.view.getParentViewNode(identifier)).is.undefined;
			expect(transaction.view.getChangeNode(identifier)).deep.equals(newNode);
		});
		it("can be malformed if detached sequence id doesn't exist", () => {
			const transaction = Transaction.factory(testTree.view);
			const detachedSequenceId = 0 as DetachedSequenceId;
			const change = {
				destination: 1 as DetachedSequenceId,
				source: [detachedSequenceId],
				type: ChangeTypeInternal.Build as ChangeTypeInternal.Build,
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
			const nodeWithEmpty = testTree.buildLeaf();
			const traits = new Map<TraitLabel, NodeId[]>();
			const emptyTrait: NodeId[] = [];
			traits.set(testTree.left.traitLabel, emptyTrait);

			const transaction = Transaction.factory(testTree.view);
			const detachedSequenceId = 0 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.build([nodeWithEmpty], detachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const viewNodeWithEmpty = transaction.view.getViewNode(nodeWithEmpty.identifier);
			expect(viewNodeWithEmpty.traits.size).to.equal(0);
		});
	});

	describe('Detach', () => {
		const testTree = refreshTestTree();

		it('can be malformed if the target range is malformed', () => {
			const transaction = Transaction.factory(testTree.view);
			const place = {
				referenceTrait: testTree.left.traitLocation,
				referenceSibling: testTree.left.identifier,
				side: Side.Before,
			};
			const range = {
				start: place,
				end: StablePlace.after(testTree.right),
			};
			const change = ChangeInternal.detach(range);
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
			const transaction = Transaction.factory(testTree.view);
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.left), 0 as DetachedSequenceId));
			const change = ChangeInternal.detach(StableRange.only(testTree.right), 0 as DetachedSequenceId);
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
			const transaction = Transaction.factory(testTree.view);
			const range = {
				start: StablePlace.atEndOf(testTree.left.traitLocation),
				end: StablePlace.atStartOf(testTree.left.traitLocation),
			};
			const change = ChangeInternal.detach(range);
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
			const transaction = Transaction.factory(testTree.view);
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.left)));
			expect(transaction.view.hasNode(testTree.left.identifier)).is.false;
		});
	});

	describe('Composite changes', () => {
		const testTree = refreshTestTree();

		it('can form a node move', () => {
			const transaction = Transaction.factory(testTree.view);
			const detachedId = 0 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.left), detachedId));
			transaction.applyChange(ChangeInternal.insert(detachedId, StablePlace.after(testTree.right)));
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(testTree.right.traitLocation)).deep.equals([
				testTree.right.identifier,
				testTree.left.identifier,
			]);
		});
		it('can form a wrap insert', () => {
			// A wrap insert is an edit that inserts a new node between a subtree and its parent atomically.
			// Ex: given A -> B -> C, a wrap insert of D around B would produce A -> D -> B -> C
			const transaction = Transaction.factory(testTree.view);
			const leftNodeDetachedId = 0 as DetachedSequenceId;
			const parentDetachedId = 1 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.left), leftNodeDetachedId));
			// This is node D, from the example
			const wrappingParentNode = testTree.buildLeaf();
			const wrappingParentId = wrappingParentNode.identifier;
			const wrappingTraitLabel = 'wrapTrait' as TraitLabel;
			transaction.applyChange(
				ChangeInternal.build(
					[
						{
							...wrappingParentNode,
							traits: { [wrappingTraitLabel]: [leftNodeDetachedId] }, // Re-parent left under new node
						},
					],
					parentDetachedId
				)
			);
			transaction.applyChange(
				ChangeInternal.insert(parentDetachedId, StablePlace.atStartOf(testTree.left.traitLocation))
			);
			const leftTrait = transaction.view.getTrait(testTree.left.traitLocation);
			expect(leftTrait).deep.equals([wrappingParentId]);
			const wrappingTrait = transaction.view.getTrait({ parent: wrappingParentId, label: wrappingTraitLabel });
			expect(wrappingTrait).deep.equals([testTree.left.identifier]);
		});
		it('can build and insert a tree that contains detached subtrees', () => {
			const transaction = Transaction.factory(testTree.view);
			const leftNodeDetachedId = 0 as DetachedSequenceId;
			const rightNodeDetachedId = 1 as DetachedSequenceId;
			const detachedIdSubtree = 2 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.left), leftNodeDetachedId));
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.right), rightNodeDetachedId));

			const detachedSubtree = {
				...testTree.buildLeaf(),
				traits: {
					[testTree.left.traitLabel]: [leftNodeDetachedId],
					[testTree.right.traitLabel]: [rightNodeDetachedId],
				},
			};
			transaction.applyChange(ChangeInternal.build([detachedSubtree], detachedIdSubtree));
			transaction.applyChange(
				ChangeInternal.insert(detachedIdSubtree, StablePlace.atStartOf(testTree.left.traitLocation))
			);
			expect(transaction.view.getTrait(testTree.right.traitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([detachedSubtree.identifier]);

			const insertedSubtree = transaction.view.getChangeNode(detachedSubtree.identifier);
			const traits = insertedSubtree.traits;

			const leftTreeTraits = traits[testTree.left.traitLabel];
			expect(leftTreeTraits).to.have.lengthOf(1);
			expect(deepCompareNodes(leftTreeTraits[0], testTree.left)).to.be.true;

			const rightTreeTraits = traits[testTree.right.traitLabel];
			expect(rightTreeTraits).to.have.lengthOf(1);
			expect(deepCompareNodes(rightTreeTraits[0], testTree.right)).to.be.true;
		});

		it('can build and insert a tree with the same identity as that of a detached subtree', () => {
			const transaction = Transaction.factory(testTree.view);
			transaction.applyChange(ChangeInternal.detach(StableRange.only(testTree.left)));
			const idOfDetachedNodeToInsert = 1 as DetachedSequenceId;
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([]);

			const newNode: ChangeNode = {
				identifier: testTree.left.identifier,
				definition: SimpleTestTree.definition,
				traits: {},
			};

			transaction.applyChange(ChangeInternal.build([newNode], idOfDetachedNodeToInsert));
			transaction.applyChange(
				ChangeInternal.insert(idOfDetachedNodeToInsert, StablePlace.atStartOf(testTree.left.traitLocation))
			);
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([testTree.left.identifier]);
		});
	});
});
