/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { DetachedSequenceId, NodeId, TraitLabel } from '../Identifiers';
import { assert } from '../Common';
import { getChangeNodeFromViewNode } from '../SerializationUtilities';
import { GenericTransaction, TransactionInternal } from '../TransactionInternal';
import {
	ChangeInternal,
	ChangeNode,
	ChangeTypeInternal,
	ConstraintEffect,
	EditStatus,
	SetValueInternal,
	Side,
	StablePlaceInternal,
	StableRangeInternal,
} from '../persisted-types';
import { StablePlace, StableRange } from '../ChangeTypes';
import { deepCompareNodes, PlaceValidationResult, RangeValidationResultKind } from '../EditUtilities';
import { SimpleTestTree } from './utilities/TestNode';
import { refreshTestTree, testTrait, testTraitLabel } from './utilities/TestUtilities';

describe('Transaction', () => {
	let transaction: GenericTransaction;
	const testTree = refreshTestTree(
		undefined,
		(t) => {
			transaction = TransactionInternal.factory(t.view);
		},
		true
	);
	describe('Constraints', () => {
		function getTestTrait(): StableRangeInternal {
			return StableRange.all(testTrait(transaction.view));
		}

		it('can be met', () => {
			transaction.applyChange({
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('can be unmet', () => {
			const badId = testTree.generateNodeId('not in tree');
			const invalidStableRange: StableRangeInternal = {
				start: { side: Side.After, referenceSibling: badId },
				end: { side: Side.Before },
			};
			const constraint = {
				toConstrain: {
					start: { side: Side.After, referenceSibling: badId },
					end: { side: Side.Before },
				},
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: TransactionInternal.ConstraintViolationKind.BadRange,
					rangeFailure: {
						kind: RangeValidationResultKind.BadPlace,
						place: invalidStableRange.start,
						placeFailure: PlaceValidationResult.MissingSibling,
					},
				},
			});
		});
		it('effect can apply anyway', () => {
			const badId = testTree.generateNodeId('not in tree');
			transaction.applyChange({
				toConstrain: {
					start: { side: Side.After, referenceSibling: badId },
					end: { side: Side.Before },
				},
				effect: ConstraintEffect.ValidRetry,
				type: ChangeTypeInternal.Constraint,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be met', () => {
			transaction.applyChange({
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint,
				length: 0,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('length can be unmet', () => {
			const constraint = {
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
				length: 1,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: TransactionInternal.ConstraintViolationKind.BadLength,
					actual: 0,
				},
			});
		});
		it('parent can be met', () => {
			transaction.applyChange({
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint,
				parentNode: testTree.identifier,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('parent can be unmet', () => {
			const parentNode = testTree.generateNodeId('not in tree');
			const constraint = {
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
				parentNode,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: TransactionInternal.ConstraintViolationKind.BadParent,
					actual: parentNode,
				},
			});
		});
		it('label can be met', () => {
			transaction.applyChange({
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint,
				label: testTraitLabel,
			});
			expect(transaction.status).equals(EditStatus.Applied);
		});
		it('label can be unmet', () => {
			const constraint = {
				toConstrain: getTestTrait(),
				effect: ConstraintEffect.InvalidAndDiscard,
				type: ChangeTypeInternal.Constraint as ChangeTypeInternal.Constraint,
				label: '7969ee2e-5418-43db-929a-4e9a23c5499d' as TraitLabel,
			};
			transaction.applyChange(constraint);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.ConstraintViolation,
				constraint,
				violation: {
					kind: TransactionInternal.ConstraintViolationKind.BadLabel,
					actual: testTraitLabel,
				},
			});
		});
	});

	describe('SetValue', () => {
		it('can be invalid if the node does not exist', () => {
			const change: SetValueInternal = {
				nodeToModify: testTree.generateNodeId(),
				payload: {},
				type: ChangeTypeInternal.SetValue,
			};
			transaction.applyChange(change);

			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.UnknownId,
				change,
				id: change.nodeToModify,
			});
		});

		it('can change payload', () => {
			const payload = { foo: {} };
			transaction.applyChange({
				nodeToModify: testTree.identifier,
				payload, // Arbitrary payload.
				type: ChangeTypeInternal.SetValue,
			});
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getViewNode(testTree.identifier).payload).deep.equals(payload);
		});

		// 'null' is not included here since it means clear the payload in setValue.
		for (const payload of [0, '', [], {}]) {
			it(`can set payload to ${JSON.stringify(payload)}`, () => {
				transaction.applyChange({
					nodeToModify: testTree.identifier,
					payload,
					type: ChangeTypeInternal.SetValue,
				});
				expect(transaction.status).equals(EditStatus.Applied);
				expect(transaction.view.getViewNode(testTree.identifier).payload).equals(payload);
			});
		}

		it('can clear an unset payload', () => {
			transaction.applyChange(ChangeInternal.clearPayload(testTree.identifier));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getViewNode(testTree.identifier), 'payload')).to.be.false;
			expect({}.hasOwnProperty.call(getChangeNodeFromViewNode(transaction.view, testTree.identifier), 'payload'))
				.to.be.false;
		});

		it('can clear a set payload', () => {
			transaction.applyChange({
				nodeToModify: testTree.identifier,
				payload: {},
				type: ChangeTypeInternal.SetValue,
			});

			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.getViewNode(testTree.identifier).payload).not.undefined;
			transaction.applyChange(ChangeInternal.clearPayload(testTree.identifier));
			expect(transaction.status).equals(EditStatus.Applied);
			expect({}.hasOwnProperty.call(transaction.view.getViewNode(testTree.identifier), 'payload')).to.be.false;
			expect({}.hasOwnProperty.call(getChangeNodeFromViewNode(transaction.view, testTree.identifier), 'payload'))
				.to.be.false;
		});
	});

	describe('Insert', () => {
		const buildId = 0 as DetachedSequenceId;

		describe('can be malformed', () => {
			it('when the detached sequence ID is bogus', () => {
				transaction.applyChange(ChangeInternal.build([testTree.buildLeafInternal()], buildId));
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
					kind: TransactionInternal.FailureKind.DetachedSequenceNotFound,
					change,
					sequenceId: change.source,
				});
			});
			it('when the target place is malformed', () => {
				const transaction = TransactionInternal.factory(testTree.view);
				transaction.applyChange(ChangeInternal.build([testTree.buildLeafInternal()], buildId));

				const referenceTrait = testTree.left.traitLocation;
				const malformedPlace = {
					// A place is malformed if it has both a reference trait and a reference sibling
					referenceTrait,
					referenceSibling: testTree.left.identifier,
					side: Side.Before,
				};
				const change = ChangeInternal.insert(buildId, malformedPlace);
				transaction.applyChange(change);
				expect(transaction.status).equals(EditStatus.Malformed);
				const result = transaction.close();
				assert(result.status === EditStatus.Malformed);
				expect(result.failure).deep.equals({
					kind: TransactionInternal.FailureKind.BadPlace,
					change,
					place: malformedPlace,
					placeFailure: PlaceValidationResult.Malformed,
				});
			});
		});
		it('can be invalid when the target place is invalid', () => {
			const badId = testTree.generateNodeId('not in tree');
			const transaction = TransactionInternal.factory(testTree.view);
			transaction.applyChange(ChangeInternal.build([testTree.buildLeafInternal()], buildId));
			const place = {
				referenceSibling: badId,
				side: Side.After,
			};
			const change = ChangeInternal.insert(buildId, place);
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.BadPlace,
				change,
				place,
				placeFailure: PlaceValidationResult.MissingSibling,
			});
		});
		it('a detached node with a payload', () => {
			const transaction = TransactionInternal.factory(testTree.view);
			const payload = 42;
			const detachedId = 0 as DetachedSequenceId;
			transaction.applyChanges([
				ChangeInternal.setPayload(testTree.left.identifier, payload),
				ChangeInternal.detach(StableRange.only(testTree.left), detachedId),
				ChangeInternal.insert(detachedId, StablePlace.atStartOf(testTree.left.traitLocation)),
			]);
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([testTree.left.identifier]);
			expect(transaction.view.getViewNode(testTree.left.identifier).payload).to.equal(payload);
		});
		[Side.Before, Side.After].forEach((side) => {
			it(`can insert a node at the ${side === Side.After ? 'beginning' : 'end'} of a trait`, () => {
				const transaction = TransactionInternal.factory(testTree.view);
				const newNodeId = testTree.generateNodeId();
				const newNode = testTree.buildLeafInternal(newNodeId);
				transaction.applyChanges(
					ChangeInternal.insertTree(
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
				const transaction = TransactionInternal.factory(testTree.view);
				const newNode = testTree.buildLeafInternal();

				transaction.applyChanges(
					ChangeInternal.insertTree([newNode], { referenceSibling: testTree.left.identifier, side })
				);
				expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals(
					side === Side.Before
						? [newNode.identifier, testTree.left.identifier]
						: [testTree.left.identifier, newNode.identifier]
				);
			});
		});
	});

	describe('Build', () => {
		it('can be malformed due to detached ID collision', () => {
			// Apply two Build_s with the same detached id
			transaction.applyChange(ChangeInternal.build([testTree.buildLeafInternal()], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const change = ChangeInternal.build([testTree.buildLeafInternal()], 0 as DetachedSequenceId);
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.DetachedSequenceIdAlreadyInUse,
				change,
				sequenceId: change.destination,
			});
		});

		it('can be malformed due to duplicate node identifiers', () => {
			// Build two nodes with the same identifier, one of them nested
			const newNode = testTree.buildLeafInternal();
			const change = ChangeInternal.build(
				[
					newNode,
					{
						...testTree.buildLeafInternal(),
						traits: {
							[testTree.left.traitLabel]: [
								{ ...testTree.buildLeafInternal(), identifier: newNode.identifier },
							],
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
				kind: TransactionInternal.FailureKind.DuplicateIdInBuild,
				change,
				id: newNode.identifier,
			});
		});

		it('is invalid when a node already exists with the given identifier', () => {
			// Build two nodes with the same identifier
			const identifier = testTree.generateNodeId();
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
				kind: TransactionInternal.FailureKind.IdAlreadyInUse,
				change,
				id: identifier,
			});
		});

		it('is invalid to build a node that has already been inserted', () => {
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
			expect(result.failure.kind).equals(TransactionInternal.FailureKind.IdAlreadyInUse);
		});

		it('can build a detached node', () => {
			const transaction = TransactionInternal.factory(testTree.view);
			const newNode = testTree.buildLeafInternal();
			transaction.applyChange(ChangeInternal.build([newNode], 0 as DetachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			expect(transaction.view.hasNode(newNode.identifier)).is.true;
			expect(transaction.view.tryGetParentViewNode(newNode.identifier)).is.undefined;
			expect(deepCompareNodes(getChangeNodeFromViewNode(transaction.view, newNode.identifier), newNode)).to.be
				.true;
		});

		it("can be malformed if detached sequence id doesn't exist", () => {
			const transaction = TransactionInternal.factory(testTree.view);
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
				kind: TransactionInternal.FailureKind.DetachedSequenceNotFound,
				change,
				sequenceId: detachedSequenceId,
			});
		});

		it('can build a node with an explicit empty trait', () => {
			// Forest should strip off the empty trait
			const nodeWithEmpty = testTree.buildLeafInternal();
			const traits = new Map<TraitLabel, NodeId[]>();
			const emptyTrait: NodeId[] = [];
			traits.set(testTree.left.traitLabel, emptyTrait);

			const transaction = TransactionInternal.factory(testTree.view);
			const detachedSequenceId = 0 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.build([nodeWithEmpty], detachedSequenceId));
			expect(transaction.status).equals(EditStatus.Applied);
			const viewNodeWithEmpty = transaction.view.getViewNode(nodeWithEmpty.identifier);
			expect(viewNodeWithEmpty.traits.size).to.equal(0);
		});
	});

	describe('Detach', () => {
		it('can be malformed if the target range is malformed', () => {
			const malformedPlace = {
				// A place is malformed if it has both a reference trait and a reference sibling
				referenceTrait: testTree.left.traitLocation,
				referenceSibling: testTree.left.identifier,
				side: Side.Before,
			};
			const range = StableRangeInternal.from(malformedPlace).to(StablePlaceInternal.after(testTree.right));
			const change = ChangeInternal.detach(range);
			// Supplied StableRange is malformed
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.BadRange,
				change,
				range,
				rangeFailure: {
					kind: RangeValidationResultKind.BadPlace,
					place: malformedPlace,
					placeFailure: PlaceValidationResult.Malformed,
				},
			});
		});
		it('can be malformed if the destination sequence id is already in use', () => {
			transaction.applyChange(
				ChangeInternal.detach(StableRangeInternal.only(testTree.left), 0 as DetachedSequenceId)
			);
			const change = ChangeInternal.detach(StableRangeInternal.only(testTree.right), 0 as DetachedSequenceId);
			// Supplied StableRange is malformed
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Malformed);
			const result = transaction.close();
			assert(result.status === EditStatus.Malformed);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.DetachedSequenceIdAlreadyInUse,
				change,
				sequenceId: change.destination,
			});
		});
		it('can be invalid if the target range is invalid', () => {
			const range = StableRangeInternal.from(StablePlaceInternal.atEndOf(testTree.left.traitLocation)).to(
				StablePlaceInternal.atStartOf(testTree.left.traitLocation)
			);
			const change = ChangeInternal.detach(range);
			// Start place is before end place
			transaction.applyChange(change);
			expect(transaction.status).equals(EditStatus.Invalid);
			const result = transaction.close();
			assert(result.status === EditStatus.Invalid);
			expect(result.failure).deep.equals({
				kind: TransactionInternal.FailureKind.BadRange,
				change,
				range,
				rangeFailure: RangeValidationResultKind.Inverted,
			});
		});
		it('can delete a node', () => {
			transaction.applyChange(ChangeInternal.detach(StableRangeInternal.only(testTree.left)));
			expect(transaction.view.hasNode(testTree.left.identifier)).is.false;
		});
	});

	describe('Composite changes', () => {
		it('can form a node move', () => {
			const detachedId = 0 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.detach(StableRangeInternal.only(testTree.left), detachedId));
			transaction.applyChange(ChangeInternal.insert(detachedId, StablePlaceInternal.after(testTree.right)));
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([]);
			expect(transaction.view.getTrait(testTree.right.traitLocation)).deep.equals([
				testTree.right.identifier,
				testTree.left.identifier,
			]);
		});
		it('can form a wrap insert', () => {
			// A wrap insert is an edit that inserts a new node between a subtree and its parent atomically.
			// Ex: given A -> B -> C, a wrap insert of D around B would produce A -> D -> B -> C
			const leftNodeDetachedId = 0 as DetachedSequenceId;
			const parentDetachedId = 1 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.detach(StableRangeInternal.only(testTree.left), leftNodeDetachedId));
			// This is node D, from the example
			const wrappingParentId = testTree.generateNodeId();
			const wrappingParentNode = testTree.buildLeafInternal(wrappingParentId);
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
			const wrappingTrait = transaction.view.getTrait({
				parent: wrappingParentId,
				label: wrappingTraitLabel,
			});
			expect(wrappingTrait).deep.equals([testTree.left.identifier]);
		});

		it('can build and insert a tree that contains detached subtrees', () => {
			const leftNodeDetachedId = 0 as DetachedSequenceId;
			const rightNodeDetachedId = 1 as DetachedSequenceId;
			const detachedIdSubtree = 2 as DetachedSequenceId;
			transaction.applyChange(ChangeInternal.detach(StableRangeInternal.only(testTree.left), leftNodeDetachedId));
			transaction.applyChange(
				ChangeInternal.detach(StableRangeInternal.only(testTree.right), rightNodeDetachedId)
			);

			const detachedNodeId = testTree.generateNodeId();
			const detachedSubtree = {
				...testTree.buildLeafInternal(detachedNodeId),
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
			expect(transaction.view.getTrait(testTree.left.traitLocation)).deep.equals([detachedNodeId]);

			const insertedSubtree = getChangeNodeFromViewNode(transaction.view, detachedNodeId);
			const traits = insertedSubtree.traits;

			const leftTreeTraits = traits[testTree.left.traitLabel];
			expect(leftTreeTraits).to.have.lengthOf(1);
			expect(deepCompareNodes(leftTreeTraits[0], testTree.left)).to.be.true;

			const rightTreeTraits = traits[testTree.right.traitLabel];
			expect(rightTreeTraits).to.have.lengthOf(1);
			expect(deepCompareNodes(rightTreeTraits[0], testTree.right)).to.be.true;
		});

		it('can build and insert a tree with the same identity as that of a detached subtree', () => {
			const transaction = TransactionInternal.factory(testTree.view);
			transaction.applyChange(ChangeInternal.detach(StableRangeInternal.only(testTree.left)));
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
