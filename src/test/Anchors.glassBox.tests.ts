/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { DetachedSequenceId, NodeId } from '../Identifiers';
import { ChangeNode } from '../generic';
import { StablePlace, StableRange, ConstraintEffect } from '../default-edits';
import {
	AnchoredChange,
	PlaceAnchor,
	PlaceAnchorSemanticsChoice,
	RangeAnchor,
	RelativePlaceAnchor,
	resolveChangeAnchors,
	findLastOffendingChange,
	resolveNodeAnchor,
	resolvePlaceAnchor,
	resolveRangeAnchor,
	updateRelativePlaceAnchorForChange,
	updateRelativePlaceAnchorForPath,
	EvaluatedChange,
} from '../anchored-edits';
import { assert, fail } from '../Common';
import { RevisionView, Side, TreeView, TransactionView } from '../TreeView';
import { EditValidationResult } from '../Checkout';
import { ReconciliationChange, ReconciliationEdit, ReconciliationPath } from '../ReconciliationPath';
import { makeEmptyNode, leftTraitLabel, rightTraitLabel } from './utilities/TestUtilities';

const left: ChangeNode = makeEmptyNode('left' as NodeId);
const priorSibling: ChangeNode = makeEmptyNode('prior' as NodeId);
const nextSibling: ChangeNode = makeEmptyNode('next' as NodeId);
const right: ChangeNode = makeEmptyNode('right' as NodeId);
const parent: ChangeNode = {
	...makeEmptyNode('parent' as NodeId),
	traits: { [leftTraitLabel]: [left], [rightTraitLabel]: [right] },
};
const initialTree: ChangeNode = {
	...makeEmptyNode('root' as NodeId),
	traits: {
		parentTraitLabel: [parent],
	},
};
const leftTraitLocation = {
	parent: parent.identifier,
	label: leftTraitLabel,
};

const startPlace = StablePlace.atStartOf(leftTraitLocation);
const endPlace = StablePlace.atEndOf(leftTraitLocation);
const beforePlace = StablePlace.before(left);
const afterPlace = StablePlace.after(left);

const startAnchor = PlaceAnchor.atStartOf(
	leftTraitLocation,
	PlaceAnchorSemanticsChoice.RelativeToNode
) as RelativePlaceAnchor;
const endAnchor = PlaceAnchor.atEndOf(
	leftTraitLocation,
	PlaceAnchorSemanticsChoice.RelativeToNode
) as RelativePlaceAnchor;
const beforeAnchor = PlaceAnchor.before(left, PlaceAnchorSemanticsChoice.RelativeToNode) as RelativePlaceAnchor;
const afterAnchor = PlaceAnchor.after(left, PlaceAnchorSemanticsChoice.RelativeToNode) as RelativePlaceAnchor;

const mockDetachedSequenceId = 42 as DetachedSequenceId;
const mockNodeId = 'mock-node-id' as NodeId;
const mockPlace = 'mock-place' as unknown as StablePlace;
const mockRange = 'mock-range' as unknown as StableRange;
const mockPlaceAnchor = 'mock-place-anchor' as unknown as RelativePlaceAnchor;
const mockView = 'mock-view' as unknown as TransactionView;
const mockPath = 'mock-path' as unknown as ReconciliationPath<AnchoredChange>;
const mockEvaluatedChange = 'mock-evaluated-change' as unknown as EvaluatedChange<AnchoredChange>;

describe('Anchor Glass Box Tests', () => {
	describe(resolveChangeAnchors.name, () => {
		const testCases = [
			{
				name: 'Insert',
				input: AnchoredChange.insert(mockDetachedSequenceId, beforeAnchor),
				expected: AnchoredChange.insert(mockDetachedSequenceId, mockPlace),
			},
			{
				name: 'Detach',
				input: AnchoredChange.detach(RangeAnchor.only(right), mockDetachedSequenceId),
				expected: AnchoredChange.detach(mockRange, mockDetachedSequenceId),
			},
			{
				name: 'SetValue (set payload)',
				input: AnchoredChange.setPayload(left.identifier, 42),
				expected: AnchoredChange.setPayload(mockNodeId, 42),
			},
			{
				name: 'SetValue (clear payload)',
				input: AnchoredChange.clearPayload(left.identifier),
				expected: AnchoredChange.clearPayload(mockNodeId),
			},
			{
				name: 'Constraint',
				input: AnchoredChange.constraint(RangeAnchor.only(right), ConstraintEffect.ValidRetry),
				expected: AnchoredChange.constraint(mockRange, ConstraintEffect.ValidRetry),
			},
		];
		for (const testCase of testCases) {
			it(`attempts to resolve anchors in ${testCase.name} changes`, () => {
				const change = testCase.input;
				const actualHappy = resolveChangeAnchors(change, mockView, [], {
					nodeResolver: () => mockNodeId,
					placeResolver: () => mockPlace,
					rangeResolver: () => mockRange,
				});
				expect(actualHappy).deep.equal(testCase.expected);
				const actualSad = resolveChangeAnchors(change, mockView, [], {
					nodeResolver: () => undefined,
					placeResolver: () => undefined,
					rangeResolver: () => undefined,
				});
				expect(actualSad).equal(undefined);
			});
		}

		it('throws when given an unsupported change type', () => {
			const fakeChange = { type: -42 };
			expect(() => resolveChangeAnchors(fakeChange as AnchoredChange, mockView, [])).throws();
		});
	});

	describe(resolveNodeAnchor.name, () => {
		it('returns the given NodeAnchor as a NodeId if the node exists in the view', () => {
			const view = RevisionView.fromTree(left);
			expect(resolveNodeAnchor(left.identifier, view, [])).equals(left.identifier);
		});

		it('returns undefined if the node does not exists in the view', () => {
			const view = RevisionView.fromTree(left);
			expect(resolveNodeAnchor(mockNodeId, view, [])).equals(undefined);
		});
	});

	describe(resolveRangeAnchor.name, () => {
		it('returns a range with resolved places when possible', () => {
			expect(
				resolveRangeAnchor(RangeAnchor.only(left), mockView, [], {
					placeResolver: () => mockPlace,
					rangeValidator: () => EditValidationResult.Valid,
				})
			).deep.equals(RangeAnchor.from(mockPlace).to(mockPlace));
		});

		it('returns undefined if either place cannot be resolved', () => {
			expect(
				resolveRangeAnchor(RangeAnchor.only(left), mockView, [], {
					placeResolver: (place: PlaceAnchor) => (place.side === Side.After ? mockPlace : undefined),
					rangeValidator: () => EditValidationResult.Valid,
				})
			).equals(undefined);
			expect(
				resolveRangeAnchor(RangeAnchor.only(left), mockView, [], {
					placeResolver: (place: PlaceAnchor) => (place.side === Side.Before ? undefined : mockPlace),
					rangeValidator: () => EditValidationResult.Valid,
				})
			).equals(undefined);
		});

		it('returns undefined the resolved places do not make a valid range', () => {
			expect(
				resolveRangeAnchor(RangeAnchor.only(left), mockView, [], {
					placeResolver: () => mockPlace,
					rangeValidator: () => EditValidationResult.Malformed,
				})
			).equals(undefined);
			expect(
				resolveRangeAnchor(RangeAnchor.only(left), mockView, [], {
					placeResolver: () => mockPlace,
					rangeValidator: () => EditValidationResult.Invalid,
				})
			).equals(undefined);
		});
	});

	describe(resolvePlaceAnchor.name, () => {
		it('returns the given anchor when that anchor is valid in the current view', () => {
			const view = RevisionView.fromTree(initialTree);
			const testWithPlace = (place) => resolvePlaceAnchor(place, view, []);
			expect(testWithPlace(startPlace)).contains(startPlace);
			expect(testWithPlace(endPlace)).contains(endPlace);
			expect(testWithPlace(beforePlace)).contains(beforePlace);
			expect(testWithPlace(afterPlace)).contains(afterPlace);
			expect(testWithPlace(PlaceAnchor.atStartOf(leftTraitLocation))).contains(startPlace);
			expect(testWithPlace(PlaceAnchor.atEndOf(leftTraitLocation))).contains(endPlace);
			expect(testWithPlace(PlaceAnchor.before(left))).contains(beforePlace);
			expect(testWithPlace(PlaceAnchor.after(left))).contains(afterPlace);
		});

		it('returns undefined when the anchor is invalid and not updatable', () => {
			expect(
				resolvePlaceAnchor(mockPlace, mockView, [], {
					placeUpdatorForPath: () => undefined,
					placeValidator: () => EditValidationResult.Invalid,
				})
			).equals(undefined);
		});

		it('returns undefined when the anchor is invalid and bound to the node', () => {
			const resolvePlaceAnchorForInvalidPlace = (place) =>
				resolvePlaceAnchor(place, mockView, [], {
					placeUpdatorForPath: () => fail(),
					placeValidator: () => EditValidationResult.Invalid,
				});
			expect(resolvePlaceAnchorForInvalidPlace(startPlace)).equals(undefined);
			expect(resolvePlaceAnchorForInvalidPlace(endPlace)).equals(undefined);
			expect(resolvePlaceAnchorForInvalidPlace(beforePlace)).equals(undefined);
			expect(resolvePlaceAnchorForInvalidPlace(afterPlace)).equals(undefined);
		});

		it('returns an updated anchor when the anchor is invalid but updatable to be valid', () => {
			let updateCountdown = 5;
			const inputView = RevisionView.fromTree(initialTree);
			const inputPlace = PlaceAnchor.after(mockNodeId);
			const placeUpdatorForPath = (
				place: RelativePlaceAnchor,
				path: ReconciliationPath<AnchoredChange>
			): PlaceAnchor | undefined => {
				expect(place).equals(inputPlace);
				expect(path).equals(mockPath);
				return --updateCountdown ? inputPlace : afterAnchor;
			};
			const placeValidator = (view, place) => {
				expect(view).equals(inputView);
				return place === inputPlace ? EditValidationResult.Invalid : EditValidationResult.Valid;
			};
			expect(
				resolvePlaceAnchor(inputPlace, inputView, mockPath, {
					placeUpdatorForPath,
					placeValidator,
				})
			).contains(PlaceAnchor.after(left));
			// Check that it took the expected number of updates
			expect(updateCountdown).equals(0);
		});

		it('returns undefined when the anchor is invalid and updatable to be invalid', () => {
			let updateCountdown = 5;
			const inputView = RevisionView.fromTree(initialTree);
			const inputPlace = PlaceAnchor.after(mockNodeId);
			const placeUpdatorForPath = (
				place: RelativePlaceAnchor,
				path: ReconciliationPath<AnchoredChange>
			): PlaceAnchor | undefined => {
				expect(place).equals(inputPlace);
				expect(path).equals(mockPath);
				return --updateCountdown ? inputPlace : undefined;
			};
			const placeValidator = (view, place) => {
				expect(view).equals(inputView);
				expect(place).equals(inputPlace);
				return EditValidationResult.Invalid;
			};
			expect(
				resolvePlaceAnchor(inputPlace, inputView, mockPath, {
					placeUpdatorForPath,
					placeValidator,
				})
			).equals(undefined);
			// Check that it took the expected number of updates
			expect(updateCountdown).equals(0);
		});

		it('throws when given an unsupported choice of anchor semantics', () => {
			const fakeAnchor = { semantics: -42 };
			expect(() => resolvePlaceAnchor(fakeAnchor as PlaceAnchor, mockView, [])).throws();
		});
	});

	describe(updateRelativePlaceAnchorForPath.name, () => {
		it('does not update anchors for start and end of traits', () => {
			expect(updateRelativePlaceAnchorForPath(startAnchor, [])).equals(undefined);
			expect(updateRelativePlaceAnchorForPath(endAnchor, [])).equals(undefined);
		});

		it('does not update anchors when the last offending change is not found', () => {
			expect(
				updateRelativePlaceAnchorForPath(startAnchor, [], {
					lastOffendingChangeFinder: () => undefined,
					placeUpdatorForChange: () => fail(),
				})
			).equals(undefined);
		});

		it('tries to update anchors when the last offending change is found', () => {
			expect(
				updateRelativePlaceAnchorForPath(beforeAnchor, [], {
					lastOffendingChangeFinder: () => mockEvaluatedChange,
					placeUpdatorForChange: (place, change) => {
						expect(place).equals(beforeAnchor);
						expect(change).equals(mockEvaluatedChange);
						return mockPlace;
					},
				})
			).equals(mockPlace);
			expect(
				updateRelativePlaceAnchorForPath(beforeAnchor, [], {
					lastOffendingChangeFinder: () => mockEvaluatedChange,
					placeUpdatorForChange: (place, change) => {
						expect(place).equals(beforeAnchor);
						expect(change).equals(mockEvaluatedChange);
						return undefined;
					},
				})
			).equals(undefined);
		});
	});

	describe(findLastOffendingChange.name, () => {
		function makeEdit(changes: readonly AnchoredChange[]): ReconciliationEdit<AnchoredChange> {
			assert(changes.length > 0);
			const steps: ReconciliationChange<AnchoredChange>[] = changes.map(makeChange);
			return Object.assign(steps, {
				before: viewBeforeChange(changes[0]),
				after: steps[steps.length - 1].after,
			});
		}

		function makeChange(change: AnchoredChange): ReconciliationChange<AnchoredChange> {
			return {
				resolvedChange: change,
				after: viewAfterChange(change) as TransactionView,
			};
		}

		function viewBeforeChange(change: AnchoredChange): TreeView {
			return change === stayInvalidChange || change === mendingChange ? invalidView : validView;
		}

		function viewAfterChange(change: AnchoredChange): TreeView {
			return change === stayValidChange || change === mendingChange ? validView : invalidView;
		}

		const validView = 'valid-view' as unknown as TreeView;
		const invalidView = 'invalid-view' as unknown as TreeView;
		const priorOffendingChange = 'prior-offending-change' as unknown as AnchoredChange;
		const lastOffendingChange = 'last-offending-change' as unknown as AnchoredChange;
		const stayValidChange = 'stay-valid-change' as unknown as AnchoredChange;
		const stayInvalidChange = 'stay-invalid-change' as unknown as AnchoredChange;
		const mendingChange = 'mending-change' as unknown as AnchoredChange;
		const priorOffendingEdit = makeEdit([priorOffendingChange]);
		const lastOffendingEdit = makeEdit([lastOffendingChange]);
		const mendingEdit = makeEdit([mendingChange]);
		const stayValidEdit = makeEdit([stayValidChange]);
		const stayInvalidEdit = makeEdit([stayInvalidChange]);

		const testWithPath = (path: ReconciliationPath<AnchoredChange>) =>
			findLastOffendingChange(mockPlaceAnchor, path, {
				placeValidator: (view) =>
					view === invalidView
						? EditValidationResult.Invalid
						: view === validView
						? EditValidationResult.Valid
						: fail(),
			});

		describe('returns undefined when the place is invalid throughout the path', () => {
			const testCases: ReconciliationPath<AnchoredChange>[] = [
				[],
				[stayInvalidEdit],
				[stayInvalidEdit, stayInvalidEdit, stayInvalidEdit],
				[makeEdit([stayInvalidChange, stayInvalidChange, stayInvalidChange])],
			];
			for (let i = 0; i < testCases.length; ++i) {
				it(`Test Case ${i}`, () => {
					expect(testWithPath(testCases[i])).equals(undefined);
				});
			}
		});

		describe('returns the last offending change when there is one', () => {
			const testCases: ReconciliationPath<AnchoredChange>[] = [
				[lastOffendingEdit],
				[lastOffendingEdit, stayInvalidEdit],
				[stayValidEdit, lastOffendingEdit],
				[stayValidEdit, lastOffendingEdit, stayInvalidEdit],
				[stayValidEdit, priorOffendingEdit, stayInvalidEdit, mendingEdit, lastOffendingEdit],
				[stayValidEdit, priorOffendingEdit, stayInvalidEdit, mendingEdit, lastOffendingEdit, stayInvalidEdit],
				[priorOffendingEdit, mendingEdit, priorOffendingEdit, mendingEdit, lastOffendingEdit],
				[makeEdit([stayValidChange, lastOffendingChange])],
				[makeEdit([lastOffendingChange, stayInvalidChange])],
				[makeEdit([stayValidChange, lastOffendingChange, stayInvalidChange])],
				[makeEdit([stayValidChange, priorOffendingChange, mendingChange, lastOffendingChange])],
				[
					makeEdit([
						priorOffendingChange,
						mendingChange,
						priorOffendingChange,
						mendingChange,
						lastOffendingChange,
					]),
				],
				[stayInvalidEdit, makeEdit([mendingChange, lastOffendingChange])],
			];
			for (let i = 0; i < testCases.length; ++i) {
				it(`Test Case ${i}`, () => {
					const actual = testWithPath(testCases[i]);
					expect(actual).deep.equals({
						before: validView,
						after: invalidView,
						change: lastOffendingChange,
					});
				});
			}
		});
	});

	describe(updateRelativePlaceAnchorForChange.name, () => {
		const afterPrior = PlaceAnchor.after(priorSibling);
		const beforeNext = PlaceAnchor.before(nextSibling);
		const rangesInSitu = [
			{
				range: RangeAnchor.from(startAnchor).to(beforeNext),
				trait: [left, nextSibling],
			},
			{
				range: RangeAnchor.from(startAnchor).to(afterAnchor),
				trait: [left],
			},
			{
				range: RangeAnchor.from(startAnchor).to(endAnchor),
				trait: [left],
			},
			{
				range: RangeAnchor.from(beforeAnchor).to(beforeNext),
				trait: [left, nextSibling],
			},
			{
				range: RangeAnchor.from(beforeAnchor).to(afterAnchor),
				trait: [left],
			},
			{
				range: RangeAnchor.from(beforeAnchor).to(endAnchor),
				trait: [left],
			},
			{
				range: RangeAnchor.from(afterPrior).to(beforeNext),
				trait: [priorSibling, left, nextSibling],
			},
			{
				range: RangeAnchor.from(afterPrior).to(afterAnchor),
				trait: [priorSibling, left],
			},
			{
				range: RangeAnchor.from(afterPrior).to(endAnchor),
				trait: [priorSibling, left],
			},
		];

		function evaluateCase(caseIndex: number, anchor: RelativePlaceAnchor): PlaceAnchor | undefined {
			const before = RevisionView.fromTree({
				...parent,
				traits: { [leftTraitLabel]: rangesInSitu[caseIndex].trait },
			}).openForTransaction();
			const filteredTrait = rangesInSitu[caseIndex].trait.filter((sibling) => sibling !== left);
			const after = RevisionView.fromTree({
				...parent,
				traits: filteredTrait.length ? { [leftTraitLabel]: filteredTrait } : {},
			}).openForTransaction();
			const evaluatedChange: EvaluatedChange<AnchoredChange> = {
				change: AnchoredChange.detach(rangesInSitu[caseIndex].range),
				before,
				after,
			};
			return updateRelativePlaceAnchorForChange(anchor, evaluatedChange);
		}

		describe('can update before(X) and after(X) when X is detached', () => {
			for (let i = 0; i < rangesInSitu.length; ++i) {
				it(`Test Case ${i}`, () => {
					const expectedAfter = rangesInSitu[i].trait[0] === priorSibling ? afterPrior : startAnchor;
					const expectedBefore =
						rangesInSitu[i].trait[rangesInSitu[i].trait.length - 1] === nextSibling
							? beforeNext
							: endAnchor;
					expect(evaluateCase(i, afterAnchor)).deep.equals(expectedAfter);
					expect(evaluateCase(i, beforeAnchor)).deep.equals(expectedBefore);
				});
			}
		});

		describe('does not update anchors for start and end of traits', () => {
			for (let i = 0; i < rangesInSitu.length; ++i) {
				it(`Test Case ${i}`, () => {
					expect(evaluateCase(i, startAnchor)).equals(undefined);
					expect(evaluateCase(i, endAnchor)).equals(undefined);
				});
			}
		});

		it('does not update anchors when the containing parent is deleted', () => {
			const before = RevisionView.fromTree(initialTree).openForTransaction();
			const after = RevisionView.fromTree({
				...initialTree,
				traits: {},
			}).openForTransaction();
			const evaluatedChange: EvaluatedChange<AnchoredChange> = {
				change: AnchoredChange.detach(RangeAnchor.only(parent)),
				before,
				after,
			};
			expect(updateRelativePlaceAnchorForChange(startAnchor, evaluatedChange)).equals(undefined);
			expect(updateRelativePlaceAnchorForChange(endAnchor, evaluatedChange)).equals(undefined);
			expect(updateRelativePlaceAnchorForChange(afterAnchor, evaluatedChange)).equals(undefined);
			expect(updateRelativePlaceAnchorForChange(beforeAnchor, evaluatedChange)).equals(undefined);
		});
	});
});
