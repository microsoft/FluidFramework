/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { NodeId } from '../Identifiers';
import { ChangeNode, TraitLocation } from '../generic';
import { StablePlace, StableRange, ConstraintEffect, revert } from '../default-edits';
import {
	AnchoredChange,
	AnchoredDelete,
	AnchoredInsert,
	AnchoredMove,
	PlaceAnchor,
	PlaceAnchorSemanticsChoice,
	RangeAnchor,
	SharedTreeWithAnchors,
} from '../anchored-edits';
import { fail } from '../Common';
import {
	makeEmptyNode,
	setUpTestSharedTreeWithAnchors,
	leftTraitLabel,
	rightTraitLabel,
	setUpLocalServerTestSharedTreeWithAnchors,
} from './utilities/TestUtilities';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests';
import { runSummaryFormatCompatibilityTests } from './utilities/SummaryFormatCompatibilityTests';
import { runSummarySizeTests } from './utilities/SummarySizeTests';

/**
 * This file contains tests that verify the behavior or anchors by checking how they are resolved in the face of concurrent edits.
 * There are two batteries of tests:
 * - The first is defined by the cartesian product of a representative set of concurrent edits (see `insertScenarios`) and a variety of
 *   anchor types--each anchor type is associated with an instance of `AnchorCaseOutcomes` which describe how that anchor should respond to
 *   concurrent edits (see `anchorCases`).
 * - The second checks the behavior of a specific anchor in the face of more special/corner-case concurrent edits.
 */

/**
 * The expected contents of the `parent` node's traits after a test.
 */
interface Outcome {
	/**
	 * The expected contents of the left trait.
	 * Defaults to [left].
	 */
	leftTrait?: ChangeNode[];
	/**
	 * The expected contents of the right trait.
	 * Defaults to [right].
	 */
	rightTrait?: ChangeNode[];
}

/**
 * The expected contents of the `parent` node's traits for a given anchor after each scenario.
 * Each field represents an expected outcome for a different set of concurrent edits in `insertScenarios`.
 */
interface AnchorCaseOutcomes {
	onNoConcurrency: Outcome;
	onMove: Outcome;
	onTeleport?: Outcome;
	onDelete: Outcome;
	onUndoDelete?: Outcome;
	onUndoRedoDelete?: Outcome;
	onDeleteParent?: Outcome;
	onDroppedEdit: Outcome;
	onInsert: Outcome;
}

/**
 * An anchor with specific semantics and in a specific contexts.
 * Includes the expected outcome of inserting the `inserted` node at the given anchor for various test scenarios.
 */
interface AnchorCase extends AnchorCaseOutcomes {
	name: string;
	insertionPlace: PlaceAnchor;
}

/**
 * The changes to apply concurrently to the change whose anchor is being tested.
 */
type ConcurrentChanges =
	| AnchoredChange
	| readonly AnchoredChange[]
	| ((tree: SharedTreeWithAnchors, anchorCase: AnchorCase) => AnchoredChange[]);

/**
 * A scenario that an `AnchorCase` could be put through.
 */
interface TestScenario {
	title: string;
	/**
	 * Where to find the expected outcome for this scenario on a given `AnchorCase`.
	 */
	outcomeKey: keyof AnchorCaseOutcomes;
	concurrent?: ConcurrentChanges;
}

const left: ChangeNode = makeEmptyNode('left' as NodeId);
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
const rightTraitLocation = {
	parent: parent.identifier,
	label: rightTraitLabel,
};

/**
 * Used for tests that require more than the left and right nodes.
 */
const extra = makeEmptyNode('extra' as NodeId);

/**
 * The node inserted by the change whose anchors are being tested.
 * Tests outcomes are decided based on where this node ends up (if present at all).
 */
const inserted = makeEmptyNode('inserted' as NodeId);

/**
 * Used for tests cases where we check `inserted`'s final location with respect to another node that is concurrently inserted.
 */
const concurrentlyInserted = makeEmptyNode('concurrently inserted' as NodeId);

const treeOptions = {
	initialTree,
	localMode: false,
	enableAnchors: true,
	allowInvalid: true,
};

const secondTreeOptions = {
	id: 'secondTestSharedTree',
	localMode: false,
	enableAnchors: true,
	allowInvalid: true,
};

const thirdTreeOptions = {
	id: 'thirdTestSharedTree',
	localMode: false,
	enableAnchors: true,
	allowInvalid: true,
};

const boundToNodeBefore = {
	name: 'BoundToNode Before(left)',
	insertionPlace: PlaceAnchor.before(left, PlaceAnchorSemanticsChoice.BoundToNode),
	onNoConcurrency: { leftTrait: [inserted, left] },
	onMove: { leftTrait: [], rightTrait: [inserted, left, right] },
	onDelete: { leftTrait: [] },
	onDroppedEdit: { leftTrait: [inserted, left] },
	onInsert: { leftTrait: [concurrentlyInserted, inserted, left] },
};

const boundToNodeAfter = {
	...boundToNodeBefore,
	name: 'BoundToNode After(left)',
	insertionPlace: PlaceAnchor.after(left, PlaceAnchorSemanticsChoice.BoundToNode),
	onNoConcurrency: { leftTrait: [left, inserted] },
	onMove: { leftTrait: [], rightTrait: [left, inserted, right] },
	onDroppedEdit: { leftTrait: [left, inserted] },
	onInsert: { leftTrait: [left, inserted, concurrentlyInserted] },
};

const boundToNodeStart = {
	...boundToNodeBefore,
	name: 'BoundToNode Start(left trait)',
	insertionPlace: PlaceAnchor.atStartOf(leftTraitLocation, PlaceAnchorSemanticsChoice.BoundToNode),
	onMove: { leftTrait: [inserted], rightTrait: [left, right] },
	onDelete: { leftTrait: [inserted] },
	onInsert: { leftTrait: [inserted, concurrentlyInserted, left] },
};

const boundToNodeEnd = {
	...boundToNodeAfter,
	name: 'BoundToNode End(left trait)',
	insertionPlace: PlaceAnchor.atEndOf(leftTraitLocation, PlaceAnchorSemanticsChoice.BoundToNode),
	onMove: { leftTrait: [inserted], rightTrait: [left, right] },
	onDelete: { leftTrait: [inserted] },
	onInsert: { leftTrait: [left, concurrentlyInserted, inserted] },
};

const relativeToNodeBefore = {
	...boundToNodeBefore,
	name: 'RelativeToNode Before(left)',
	insertionPlace: PlaceAnchor.before(left, PlaceAnchorSemanticsChoice.RelativeToNode),
	onDelete: { leftTrait: [inserted] },
};

const relativeToNodeAfter = {
	...boundToNodeAfter,
	name: 'RelativeToNode After(left)',
	insertionPlace: PlaceAnchor.after(left, PlaceAnchorSemanticsChoice.RelativeToNode),
	onDelete: relativeToNodeBefore.onDelete,
};

const relativeToNodeStart = {
	...boundToNodeStart,
	name: 'RelativeToNode Start(left trait)',
	insertionPlace: PlaceAnchor.atStartOf(leftTraitLocation, PlaceAnchorSemanticsChoice.RelativeToNode),
};

const relativeToNodeEnd = {
	...boundToNodeEnd,
	name: 'RelativeToNode End(left trait)',
	insertionPlace: PlaceAnchor.atEndOf(leftTraitLocation, PlaceAnchorSemanticsChoice.RelativeToNode),
};

/**
 * A representative set of possible anchors with a variety of semantics and in a variety of contexts.
 * Includes the expected outcome of inserting the `inserted` node at the given anchor for various test scenarios.
 */
const anchorCases: readonly AnchorCase[] = [
	boundToNodeBefore,
	boundToNodeAfter,
	boundToNodeStart,
	boundToNodeEnd,
	relativeToNodeBefore,
	relativeToNodeAfter,
	relativeToNodeStart,
	relativeToNodeEnd,
];

/**
 * A set of test scenario where `inserted` is inserted at a given anchor.
 */
const insertScenarios: TestScenario[] = [
	{
		title: 'when there are no concurrent edits',
		outcomeKey: 'onNoConcurrency',
	},
	{
		title: 'when target sibling is moved to a different trait',
		outcomeKey: 'onMove',
		concurrent: AnchoredMove.create(StableRange.only(left), StablePlace.before(right)),
	},
	{
		title: 'when target sibling is deleted then re-inserted in a different trait',
		outcomeKey: 'onTeleport',
		concurrent: [
			AnchoredDelete.create(StableRange.only(left)),
			...AnchoredInsert.create([left], StablePlace.before(right)),
		],
	},
	{
		title: 'when target sibling is deleted with (before, before) range',
		outcomeKey: 'onDelete',
		concurrent: AnchoredDelete.create({
			start: StablePlace.before(left),
			end: StablePlace.atEndOf(leftTraitLocation),
		}),
	},
	{
		title: 'when target sibling is deleted with (before, after) range',
		outcomeKey: 'onDelete',
		concurrent: AnchoredDelete.create({
			start: StablePlace.before(left),
			end: StablePlace.after(left),
		}),
	},
	{
		title: 'when target sibling is deleted with (after, before) range',
		outcomeKey: 'onDelete',
		concurrent: AnchoredDelete.create({
			start: StablePlace.atStartOf(leftTraitLocation),
			end: StablePlace.atEndOf(leftTraitLocation),
		}),
	},
	{
		title: 'when target sibling is deleted with (after, after) range',
		outcomeKey: 'onDelete',
		concurrent: AnchoredDelete.create({
			start: StablePlace.atStartOf(leftTraitLocation),
			end: StablePlace.after(left),
		}),
	},
	{
		title: 'when target sibling is deleted then un-deleted',
		outcomeKey: 'onUndoDelete',
		concurrent: (tree: SharedTreeWithAnchors) => {
			const deletionEditId = tree.editor.delete(StableRange.only(left));
			const deletionEditIndex = tree.edits.getIndexOfId(deletionEditId);
			const deletionEdit = tree.edits.getEditInSessionAtIndex(deletionEditIndex);
			return revert(deletionEdit.changes, tree.logViewer.getRevisionViewInSession(deletionEditIndex));
		},
	},
	{
		title: 'when target sibling is deleted then un-deleted and re-deleted',
		outcomeKey: 'onUndoRedoDelete',
		concurrent: (tree: SharedTreeWithAnchors) => {
			const deletionEditId = tree.editor.delete(StableRange.only(left));
			const deletionEditIndex = tree.edits.getIndexOfId(deletionEditId);
			const deletionEdit = tree.edits.getEditInSessionAtIndex(deletionEditIndex);
			const undoEditId = tree.editor.revert(
				deletionEdit,
				tree.logViewer.getRevisionViewInSession(deletionEditIndex)
			);
			const undoEditIndex = tree.edits.getIndexOfId(undoEditId);
			const undoEdit = tree.edits.getEditInSessionAtIndex(undoEditIndex);
			return revert(undoEdit.changes, tree.logViewer.getRevisionViewInSession(undoEditIndex));
		},
	},
	{
		title: 'when target sibling parent is deleted',
		outcomeKey: 'onDeleteParent',
		concurrent: AnchoredDelete.create(StableRange.only(parent)),
	},
	{
		title: 'when target sibling is moved in an edit that is dropped',
		outcomeKey: 'onDroppedEdit',
		concurrent: [
			// Valid move
			...AnchoredMove.create(StableRange.only(left), StablePlace.before(right)),
			// Invalid constraint
			AnchoredChange.constraint(StableRange.only(left), ConstraintEffect.InvalidAndDiscard, undefined, 0),
		],
	},
	{
		title: 'when target sibling is deleted in an edit that is dropped',
		outcomeKey: 'onDroppedEdit',
		concurrent: [
			// Valid delete
			AnchoredDelete.create(StableRange.only(left)),
			// Invalid constraint
			AnchoredChange.constraint(StableRange.only(left), ConstraintEffect.InvalidAndDiscard, undefined, 0),
		],
	},
	{
		title: 'when target place is inserted at',
		outcomeKey: 'onInsert',
		concurrent: (_: unknown, anchorCase: AnchorCase) =>
			AnchoredInsert.create([concurrentlyInserted], anchorCase.insertionPlace),
	},
];

describe('SharedTreeWithAnchors', () => {
	describe('Fulfills the SharedTree contract', () => {
		runSharedTreeOperationsTests<SharedTreeWithAnchors>('SharedTree Operations', setUpTestSharedTreeWithAnchors);
		runSummaryFormatCompatibilityTests<SharedTreeWithAnchors>(
			'SharedTree Summary',
			setUpTestSharedTreeWithAnchors,
			setUpLocalServerTestSharedTreeWithAnchors
		);
		runSummarySizeTests<SharedTreeWithAnchors>('Summary size', setUpLocalServerTestSharedTreeWithAnchors);
	});

	it('PlaceAnchor builders default to RelativeToNode semantics', () => {
		const start = PlaceAnchor.atStartOf(leftTraitLocation);
		const end = PlaceAnchor.atEndOf(leftTraitLocation);
		const before = PlaceAnchor.before(left);
		const after = PlaceAnchor.after(left);
		expect(start.semantics).equals(PlaceAnchorSemanticsChoice.RelativeToNode);
		expect(end.semantics).equals(PlaceAnchorSemanticsChoice.RelativeToNode);
		expect(before.semantics).equals(PlaceAnchorSemanticsChoice.RelativeToNode);
		expect(after.semantics).equals(PlaceAnchorSemanticsChoice.RelativeToNode);
	});

	it('RangeAnchor builders default to RelativeToNode semantics', () => {
		const range = RangeAnchor.only(left);
		expect(range.start.semantics).equals(PlaceAnchorSemanticsChoice.RelativeToNode);
		expect(range.end.semantics).equals(PlaceAnchorSemanticsChoice.RelativeToNode);
	});

	// This is the main battery of tests.
	// These tests insert the `inserted` node at a given PlaceAnchor in different scenarios and check where that node ends up.
	// The scenarios cover the various ways concurrent change might affect an anchor.
	describe('Basic scenarios', () => {
		for (const insertScenario of insertScenarios) {
			describe(insertScenario.title, () => {
				insertTestsWithExtraChanges(insertScenario.outcomeKey, insertScenario.concurrent);
			});
		}
	});

	// These tests exercise special scenarios that the main battery of tests (above) does not cover.
	// They are mainly aimed at uncovering invalid assumptions that the anchor resolution implementation might make.
	// While these tests could be made exhaustive like the main battery, doing so would just add redundant coverage.
	describe(`Special scenarios`, () => {
		it('when target place is invalid', () => {
			const { treeA, treeB, container } = setupTrees();
			treeA.editor.insert(inserted, PlaceAnchor.before(inserted));
			container.processAllMessages();
			expectChangedTraits(treeA, treeB, {});
		});

		// For each scenario we test with:
		//   groupInEdit=true:  the concurrent changes that introduced the conflict were applied in a single edit
		//   groupInEdit=false: the concurrent changes that introduced the conflict were applied in separate edits
		for (const groupInEdit of [true, false]) {
			describe(groupInEdit ? 'In one edit' : 'In separate edits', () => {
				// These tests verify that re-anchoring works even when more than one place anchor needs updating.
				it('when target place and source range both need updating due to two deletes', () => {
					const { treeA, treeB, container } = setupTrees();
					treeA.editor.insert(extra, StablePlace.before(left));
					container.processAllMessages();

					if (groupInEdit) {
						treeB.editor.applyChanges([
							AnchoredDelete.create(RangeAnchor.only(left)),
							AnchoredDelete.create(RangeAnchor.all(rightTraitLocation)),
						]);
					} else {
						treeB.editor.delete(RangeAnchor.only(left));
						treeB.editor.delete(RangeAnchor.all(rightTraitLocation));
					}

					const beforeExtra = PlaceAnchor.before(extra);
					const afterExtra = PlaceAnchor.after(extra);
					treeA.editor.move(RangeAnchor.from(beforeExtra).to(afterExtra), PlaceAnchor.before(right));
					container.processAllMessages();
					expectChangedTraits(treeA, treeB, { leftTrait: [], rightTrait: [extra] });
				});
			});
		}

		// This test covers the scenario that yields different results depending on whether the front-biased approach
		// seeks backward to find the most recent offending change at the granularity of changes or at the granularity of edits
		// and then proceeds through changes forward.
		it('when target place is teleported then deleted in a single edit', () => {
			const { treeA, treeB, container } = setupTrees();

			treeB.editor.applyChanges([
				// The reanchor will happen on this change if seeking backward through edits and then forward through changes
				AnchoredDelete.create(RangeAnchor.only(left)),
				...AnchoredInsert.create([left], PlaceAnchor.atStartOf(rightTraitLocation)),
				// The reanchor will happen on this change if seeking backward through changes
				AnchoredDelete.create(RangeAnchor.only(left)),
			]);

			treeA.editor.insert(inserted, PlaceAnchor.before(left));
			container.processAllMessages();
			expectChangedTraits(treeA, treeB, { leftTrait: [], rightTrait: [inserted, right] });
		});

		// This test covers the scenario that yields different results depending on whether the front-biased approach
		// seeks backward to find the most recent offending change at the granularity of changes or at the granularity of edits.
		it('when target place is teleported then deleted across edits', () => {
			const { treeA, treeB, container } = setupTrees();

			// The reanchor will happen on this change if seeking backward through edits
			treeB.editor.delete(left);
			treeB.editor.applyChanges([
				...AnchoredInsert.create([left], StablePlace.atStartOf(rightTraitLocation)),
				// The reanchor will happen on this change if seeking backward through changes
				AnchoredDelete.create(StableRange.only(left)),
			]);

			treeA.editor.insert(inserted, PlaceAnchor.before(left));
			container.processAllMessages();
			expectChangedTraits(treeA, treeB, { leftTrait: [], rightTrait: [inserted, right] });
		});

		// This test covers the scenario that yields different results depending on whether the changes of the edit being applied are
		// included in the reconciliation path or not.
		it('when target place is deleted by the edit being rebased', () => {
			const { treeA, treeB, container } = setupTrees();

			treeB.editor.move(left, PlaceAnchor.before(right));
			treeA.editor.applyChanges([
				// The reanchor will happen on this change if changes for this edit are included in the reconciliation path
				AnchoredDelete.create(RangeAnchor.all(rightTraitLocation)),
				// This change will fail if changes for this edit are not included in the reconciliation path
				...AnchoredInsert.create([inserted], PlaceAnchor.before(left)),
			]);
			container.processAllMessages();
			expectChangedTraits(treeA, treeB, { leftTrait: [], rightTrait: [inserted] });
		});

		// These tests cover the scenario that yields different results depending on whether the change application performed on the
		// reconciliation path is itself using anchor resolution
		for (const extraChange of [false, true]) {
			it(`when target place resolution requires resolution of a different place in another edit${
				extraChange ? ' (with extra change)' : ''
			}`, () => {
				const { treeA, treeB, container } = setupTrees();
				const { tree: treeC } = setUpTestSharedTreeWithAnchors({
					containerRuntimeFactory: container,
					...thirdTreeOptions,
				});
				treeA.editor.insert(extra, StablePlace.before(right));
				treeA.editor.move(left, StablePlace.before(extra));
				container.processAllMessages();
				// State of right trait: [left, extra, right]

				treeB.editor.move(left, StablePlace.after(extra));
				// State of right trait: [extra, left, right]
				treeB.editor.delete(left);
				// State of right trait: [extra, left-tombstone, right]

				treeC.editor.applyChanges([
					// Will be re-anchored to delete [right] instead of [left, extra, right]
					AnchoredDelete.create(
						RangeAnchor.from(PlaceAnchor.before(left)).to(StablePlace.atEndOf(rightTraitLocation))
					),
					// When present, the no-op change after the change of interest to ensures the anchor resolution uses resolved
					// changes in the reconciliation path (or derives them).
					// When not present, the above delete is the only change in the edit so there's a possibility that the anchor
					// resolution would use cached edit results (which reflect the resolved changes) and therefore don't require
					// the actual use of resolved changes.
					// We still want to test without this extra change to ensure that such a possibility, if leveraged, does work
					// properly.
					...(extraChange ? [AnchoredChange.clearPayload(parent.identifier)] : []),
				]);
				// State of right trait: [extra, left-tombstone, right-tombstone]

				treeA.editor.insert(inserted, PlaceAnchor.after(right));
				// State of right trait: [extra, left-tombstone, right-tombstone, inserted]
				// Unless anchor resolution is not performed which case the edit will fail when it tries to apply the
				// "delete everything before left" edit because it will not take into account the resolved location for "before left".

				container.processAllMessages();
				expectChangedTraits(treeA, treeB, { leftTrait: [], rightTrait: [extra, inserted] });
			});
		}
	});
});

/**
 * Runs an insertion test scenario on all possible anchors.
 */
function insertTestsWithExtraChanges(
	outcomeField: keyof AnchorCaseOutcomes,
	concurrentSteps?: ConcurrentChanges
): void {
	for (const anchorCase of anchorCases) {
		const outcome = outcomeFromCaseAndField(anchorCase, outcomeField);
		insertTest(anchorCase, outcome, concurrentSteps);
	}
}

/**
 * Provides the expected outcome for a particular `AnchorCase` instance and scenario (described by its `outcomeField`)
 * This helps reduce cruft in the `AnchorCase` by providing general expectations (e.g., concurrently deleting a node and undoing the
 * deletion is expected, unless otherwise specified, to yield the same outcome as through no concurrent changes were made).
 */
function outcomeFromCaseAndField(anchorCase: AnchorCase, outcomeField: keyof AnchorCaseOutcomes): Outcome {
	if (anchorCase[outcomeField] !== undefined) {
		return anchorCase[outcomeField] as Outcome;
	}
	switch (outcomeField) {
		case 'onUndoDelete':
			return outcomeFromCaseAndField(anchorCase, 'onNoConcurrency');
		case 'onUndoRedoDelete':
			return outcomeFromCaseAndField(anchorCase, 'onDelete');
		case 'onTeleport':
			return outcomeFromCaseAndField(anchorCase, 'onMove');
		case 'onDeleteParent':
			return { leftTrait: [], rightTrait: [] };
		default:
			fail('The expected outcome for this case has not been specified');
	}
}

/**
 * Runs the insertion test characterized by the anchor as which to insert, the expected outcome, and the concurrent changes to apply.
 */
function insertTest(anchorCase: AnchorCase, expected: Outcome, concurrentSteps?: ConcurrentChanges): void {
	it(anchorCase.name, () => {
		const { tree: treeA, containerRuntimeFactory } = setUpTestSharedTreeWithAnchors(treeOptions);
		const { tree: treeB } = setUpTestSharedTreeWithAnchors({
			containerRuntimeFactory,
			...secondTreeOptions,
		});
		// Sync initial tree
		containerRuntimeFactory.processAllMessages();

		const concurrentChanges =
			concurrentSteps === undefined
				? []
				: typeof concurrentSteps === 'function'
				? concurrentSteps(treeB, anchorCase)
				: Array.isArray(concurrentSteps)
				? concurrentSteps
				: [concurrentSteps as AnchoredChange];

		// Perform the concurrent edit(s) to be sequenced first
		if (concurrentSteps) {
			treeB.editor.applyChanges(concurrentChanges);
		}

		// Make the insertion at the anchored place
		treeA.editor.insert(inserted, anchorCase.insertionPlace);

		containerRuntimeFactory.processAllMessages();

		// Test the outcome matches expectations
		expectChangedTraits(treeA, treeB, expected);
	});
}

function expectChangedTraits(treeA: SharedTreeWithAnchors, treeB: SharedTreeWithAnchors, expected: Outcome) {
	const leftIds = (expected.leftTrait ?? [left]).map((node) => node.identifier);
	const rightIds = (expected.rightTrait ?? [right]).map((node) => node.identifier);
	expect(tryGetTrait(treeA, leftTraitLocation)).deep.equal(leftIds);
	expect(tryGetTrait(treeB, leftTraitLocation)).deep.equal(leftIds);
	expect(tryGetTrait(treeA, rightTraitLocation)).deep.equal(rightIds);
	expect(tryGetTrait(treeB, rightTraitLocation)).deep.equal(rightIds);
}

function tryGetTrait(tree: SharedTreeWithAnchors, location: TraitLocation): readonly NodeId[] {
	return tree.currentView.hasNode(location.parent) ? tree.currentView.getTrait(location) : [];
}

function setupTrees(): {
	treeA: SharedTreeWithAnchors;
	treeB: SharedTreeWithAnchors;
	container: MockContainerRuntimeFactory;
} {
	const { tree: treeA, containerRuntimeFactory: container } = setUpTestSharedTreeWithAnchors(treeOptions);
	const { tree: treeB } = setUpTestSharedTreeWithAnchors({
		containerRuntimeFactory: container,
		...secondTreeOptions,
	});
	container.processAllMessages();
	return { treeA, treeB, container };
}
