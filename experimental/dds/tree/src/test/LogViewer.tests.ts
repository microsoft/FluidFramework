/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { EditLog } from '../EditLog';
import {
	CachingLogViewer,
	EditStatusCallback,
	LogViewer,
	SequencedEditResult,
	SequencedEditResultCallback,
} from '../LogViewer';
import { EditId } from '../Identifiers';
import { assert, copyPropertyIfDefined } from '../Common';
import { initialTree } from '../InitialTree';
import {
	ChangeInternal,
	ChangeNode,
	ChangeTypeInternal,
	ConstraintEffect,
	Edit,
	EditStatus,
	SetValueInternal,
	StablePlaceInternal,
} from '../persisted-types';
import { areRevisionViewsSemanticallyEqual, newEdit } from '../EditUtilities';
import { NodeIdContext } from '../NodeIdUtilities';
import { RevisionView } from '../RevisionView';
import { TransactionInternal } from '../TransactionInternal';
import { Change, ChangeType, StableRange } from '../ChangeTypes';
import { expectDefined } from './utilities/TestCommon';
import { buildLeaf, TestTree } from './utilities/TestNode';
import { refreshTestTree, testTraitLabel } from './utilities/TestUtilities';

/**
 * Creates an {@link EditLog} and accompanying {@link RevisionView} with pre-existing edits.
 *
 * @remarks Intended to be used with {@link getSimpleLogBaseView}
 * @param testTree - Test tree to work on
 * @param numEdits - The number of edits to make to the base tree
 */
function getTestTreeLog(testTree: TestTree): EditLog<ChangeInternal> {
	const log = new EditLog<ChangeInternal>();
	log.addSequencedEdit(
		newEdit(
			ChangeInternal.insertTree(
				[testTree.buildLeaf(testTree.left.identifier)],
				StablePlaceInternal.atStartOf(testTree.left.traitLocation)
			)
		),
		{ sequenceNumber: 1, referenceSequenceNumber: 0 }
	);
	log.addSequencedEdit(
		newEdit(
			ChangeInternal.insertTree(
				[testTree.buildLeaf(testTree.right.identifier)],
				StablePlaceInternal.atStartOf(testTree.right.traitLocation)
			)
		),
		{ sequenceNumber: 2, referenceSequenceNumber: 1 }
	);

	return log;
}

function getLogWithNumEdits(nodeIdContext: NodeIdContext, numEdits: number): EditLog<ChangeInternal> {
	const log = new EditLog<ChangeInternal>();
	for (let i = 0; i < numEdits; i++) {
		log.addSequencedEdit(
			newEdit(
				ChangeInternal.insertTree(
					[buildLeaf(nodeIdContext.generateNodeId())],
					StablePlaceInternal.atStartOf({
						label: testTraitLabel,
						parent: nodeIdContext.convertToNodeId(initialTree.identifier),
					})
				)
			),
			{
				sequenceNumber: i + 1,
				referenceSequenceNumber: i,
			}
		);
	}

	return log;
}

/**
 * Get a base view for a log created with {@link getTestTreeLog}.
 * This can then be used to construct a {@link LogViewer} for that log.
 *
 * @param testTree - Test tree to work from
 */
function getSimpleLogBaseView(testTree: TestTree): RevisionView {
	const node: ChangeNode = { definition: testTree.definition, identifier: testTree.identifier, traits: {} };
	copyPropertyIfDefined(testTree, node, 'payload');
	return RevisionView.fromTree(node);
}

function getSimpleLogWithLocalEdits(testTree: TestTree): EditLog<ChangeInternal> {
	const logWithLocalEdits = getTestTreeLog(testTree);
	logWithLocalEdits.addLocalEdit(
		newEdit(
			ChangeInternal.insertTree(
				[testTree.buildLeafInternal()],
				StablePlaceInternal.atEndOf(testTree.left.traitLocation)
			)
		)
	);
	logWithLocalEdits.addLocalEdit(
		newEdit(
			ChangeInternal.insertTree(
				[testTree.buildLeafInternal()],
				StablePlaceInternal.atEndOf(testTree.right.traitLocation)
			)
		)
	);
	logWithLocalEdits.addLocalEdit(
		newEdit(
			ChangeInternal.insertTree(
				[testTree.buildLeafInternal()],
				StablePlaceInternal.atEndOf(testTree.left.traitLocation)
			)
		)
	);
	return logWithLocalEdits;
}

function getViewsForLog(log: EditLog<ChangeInternal>, baseView: RevisionView): RevisionView[] {
	const views: RevisionView[] = [baseView];
	for (let i = 0; i < log.length; i++) {
		const edit = log.getEditInSessionAtIndex(i);
		const result = TransactionInternal.factory(views[i]).applyChanges(edit.changes).close();
		if (result.status === EditStatus.Applied) {
			views.push(result.after);
		} else {
			expect.fail('edit failed to apply');
		}
	}
	return views;
}

function runLogViewerCorrectnessTests(
	viewerCreator: (log: EditLog<ChangeInternal>, baseView: RevisionView) => LogViewer
): Mocha.Suite {
	return describe('LogViewer', () => {
		let simpleLog: EditLog<ChangeInternal>;
		let simpleLogBaseView: RevisionView;
		let simpleLogInitialView: RevisionView;
		const testTree = refreshTestTree(undefined, (t) => {
			simpleLogBaseView = getSimpleLogBaseView(t);
			simpleLog = getTestTreeLog(t);
			simpleLogInitialView = t.view;
		});

		it('generates initialTree by default for the 0th revision', () => {
			const viewer = viewerCreator(new EditLog(), simpleLogBaseView);
			const headView = viewer.getRevisionViewInSession(0);
			expect(headView.equals(expectDefined(RevisionView.fromTree(initialTree, testTree))));
		});

		it('can be constructed from a non-empty EditLog', () => {
			const viewer = viewerCreator(simpleLog, simpleLogBaseView);
			const headView = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
			expect(areRevisionViewsSemanticallyEqual(headView, testTree, simpleLogInitialView, testTree));
			expect(headView.equals(simpleLogInitialView)).to.be.true;
		});

		it('can generate all revision views for an EditLog', () => {
			const baseView = expectDefined(RevisionView.fromTree(initialTree, testTree));
			const numNodes = 10;
			const viewer = viewerCreator(getLogWithNumEdits(testTree, numNodes), baseView);
			const initialRevision = viewer.getRevisionViewInSession(0);
			expect(initialRevision.equals(baseView)).to.be.true;
			expect(initialRevision.size).to.equal(1);
			const oneNodeView = viewer.getRevisionViewInSession(1);
			const testTrait = {
				label: testTraitLabel,
				parent: testTree.convertToNodeId(initialTree.identifier),
			};
			expect(oneNodeView.getTrait(testTrait).length).to.equal(1);
			const twoNodeView = viewer.getRevisionViewInSession(2);
			expect(twoNodeView.getTrait(testTrait).length).to.equal(2);
			const finalView = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
			expect(finalView.getTrait(testTrait).length).to.equal(numNodes);
		});

		it('produces correct revision views when the log is mutated', () => {
			const mutableLog = new EditLog<ChangeInternal>();
			const viewer = viewerCreator(mutableLog, simpleLogBaseView);
			const viewsForLog = getViewsForLog(simpleLog, simpleLogBaseView);
			// This test takes an empty log (A) and a log with edits in it (B), and adds the edits from B to A.
			// After each addition, the test code will iterate from [0, length_of_A] and get a view for each revision via LogViewer
			// and assert that none of the views differ from those created via pure Transaction APIs.
			for (let i = 0; i <= simpleLog.length; i++) {
				for (let j = 0; j <= mutableLog.length; j++) {
					const viewerView = viewer.getRevisionViewInSession(j);
					expect(viewerView.equals(viewsForLog[j])).to.be.true;
				}
				// Revisions are from [0, simpleLog.length], edits are at indices [0, simpleLog.length)
				if (i < simpleLog.length) {
					const edit = simpleLog.getEditInSessionAtIndex(i);
					mutableLog.addSequencedEdit(edit, { sequenceNumber: i + 1, referenceSequenceNumber: i });
				}
			}
		});

		it('produces correct revision views when local edits are shifted in the log due to sequenced edits being added', () => {
			function getViewsFromViewer(viewer: LogViewer, lastRevision: number): RevisionView[] {
				const views: RevisionView[] = [];
				for (let i = 0; i <= lastRevision; i++) {
					views.push(viewer.getRevisionViewInSession(i));
				}
				return views;
			}

			function expectViewsAreEqual(log: EditLog<ChangeInternal>, viewer: LogViewer): void {
				const viewsForLog = getViewsForLog(log, simpleLogBaseView);
				const viewsForViewer = getViewsFromViewer(viewer, log.length);
				expect(viewsForLog.length).to.equal(viewsForViewer.length);
				for (let i = 0; i < viewsForLog.length; i++) {
					expect(viewsForLog[i].equals(viewsForViewer[i])).to.be.true;
				}
			}

			const logWithLocalEdits = getSimpleLogWithLocalEdits(testTree);
			const viewer = viewerCreator(logWithLocalEdits, simpleLogBaseView);
			expectViewsAreEqual(logWithLocalEdits, viewer);

			let seqNumber = 1;
			// Sequence the existing local edits and ensure viewer generates the correct views
			while (logWithLocalEdits.numberOfLocalEdits > 0) {
				// Add a remote sequenced edit
				logWithLocalEdits.addSequencedEdit(
					newEdit(
						ChangeInternal.insertTree(
							[testTree.buildLeafInternal()],
							StablePlaceInternal.atStartOf(testTree.right.traitLocation)
						)
					),
					{ sequenceNumber: seqNumber, referenceSequenceNumber: seqNumber - 1 }
				);
				++seqNumber;
				expectViewsAreEqual(logWithLocalEdits, viewer);
				// Sequence a local edit
				logWithLocalEdits.addSequencedEdit(
					logWithLocalEdits.getEditInSessionAtIndex(logWithLocalEdits.numberOfSequencedEdits),
					{ sequenceNumber: seqNumber, referenceSequenceNumber: seqNumber - 1 }
				);
				++seqNumber;
				expectViewsAreEqual(logWithLocalEdits, viewer);
			}
		});
	});
}

describe('CachingLogViewer', () => {
	// TODO: Dedupe? shared hook for getting all of this stuff?
	let simpleLog: EditLog<ChangeInternal>;
	let simpleLogBaseView: RevisionView;
	let simpleLogInitialView: RevisionView;
	// An arbitrary revision view which can be used to check to see if it gets used when provided as a cached value.
	let arbitraryRevisionView: RevisionView;
	const testTree = refreshTestTree(undefined, (t) => {
		simpleLogBaseView = getSimpleLogBaseView(t);
		simpleLog = getTestTreeLog(t);
		simpleLogInitialView = t.view;
		arbitraryRevisionView = RevisionView.fromTree(t.buildLeaf(t.generateNodeId()));
	});

	function getCachingLogViewerAssumeAppliedEdits(
		log: EditLog<ChangeInternal>,
		baseView: RevisionView,
		editStatusCallback?: EditStatusCallback,
		sequencedEditResultCallback?: SequencedEditResultCallback,
		knownRevisions?: [number, RevisionView][]
	): CachingLogViewer {
		return new CachingLogViewer(
			log,
			baseView,
			knownRevisions?.map((pair) => [pair[0], { view: pair[1], result: EditStatus.Applied }]),
			/* expensiveValidation */ true,
			editStatusCallback,
			sequencedEditResultCallback,
			log.numberOfSequencedEdits
		);
	}

	runLogViewerCorrectnessTests(getCachingLogViewerAssumeAppliedEdits);

	it('detects non-integer revisions when setting revision views', async () => {
		expect(() => {
			return getCachingLogViewerAssumeAppliedEdits(simpleLog, simpleLogBaseView, undefined, undefined, [
				[2.4, simpleLogInitialView],
			]);
		}).to.throw('revision must be an integer');
	});

	it('detects out-of-bounds revisions when setting revision views', async () => {
		expect(() => {
			return getCachingLogViewerAssumeAppliedEdits(simpleLog, simpleLogBaseView, undefined, undefined, [
				[1000, simpleLogInitialView],
			]);
		}).to.throw('revision must correspond to the result of a SequencedEdit');
	});

	it('can be created with known revisions', async () => {
		const views = getViewsForLog(simpleLog, simpleLogBaseView);
		const viewer = getCachingLogViewerAssumeAppliedEdits(
			simpleLog,
			simpleLogBaseView,

			undefined,
			undefined,
			Array.from(views.keys()).map((revision) => [revision, views[revision]])
		);
		for (let i = simpleLog.length; i >= 0; i--) {
			expect(viewer.getRevisionViewInSession(i).equals(views[i])).to.be.true;
		}
	});

	async function requestAllRevisionViews(viewer: CachingLogViewer, log: EditLog<ChangeInternal>): Promise<void> {
		for (let i = 0; i <= log.length; i++) {
			await viewer.getRevisionView(i);
		}
	}

	it('caches revision views for sequenced edits', async () => {
		let editsProcessed = 0;
		const viewer = getCachingLogViewerAssumeAppliedEdits(simpleLog, simpleLogBaseView, () => editsProcessed++);
		assert(simpleLog.length < CachingLogViewer.sequencedCacheSizeMax);

		await requestAllRevisionViews(viewer, simpleLog);
		expect(editsProcessed).to.equal(simpleLog.length);

		// Ask for every view; no edit application should occur, since the views will be cached.
		for (let i = 0; i <= simpleLog.length; i++) {
			await viewer.getRevisionView(i);
		}
		expect(editsProcessed).to.equal(simpleLog.length);
	});

	it('caches edit results for sequenced edits', async () => {
		// Add an invalid edit
		simpleLog.addSequencedEdit(
			newEdit([
				{
					type: ChangeTypeInternal.Constraint,
					toConstrain: StableRange.only(testTree.left),
					effect: ConstraintEffect.InvalidAndDiscard,
					length: 0,
				},
			]),
			{ sequenceNumber: 3, referenceSequenceNumber: 2, minimumSequenceNumber: 2 }
		);
		let editsProcessed = 0;
		const viewer = getCachingLogViewerAssumeAppliedEdits(simpleLog, simpleLogBaseView, () => editsProcessed++);
		assert(simpleLog.length < CachingLogViewer.sequencedCacheSizeMax);

		await requestAllRevisionViews(viewer, simpleLog);
		expect(editsProcessed).to.equal(simpleLog.length);

		expect((await viewer.getEditResult(0)).status).equals(undefined);
		expect((await viewer.getEditResult(1)).status).equals(EditStatus.Applied);
		expect((await viewer.getEditResult(2)).status).equals(EditStatus.Applied);
		expect((await viewer.getEditResult(3)).status).equals(EditStatus.Invalid);

		expect(viewer.getEditResultInSession(0).status).equals(undefined);
		expect(viewer.getEditResultInSession(1).status).equals(EditStatus.Applied);
		expect(viewer.getEditResultInSession(2).status).equals(EditStatus.Applied);
		expect(viewer.getEditResultInSession(3).status).equals(EditStatus.Invalid);
	});

	it('caches the highest revision', async () => {
		const viewer = getCachingLogViewerAssumeAppliedEdits(simpleLog, simpleLogBaseView);
		expect(viewer.highestRevisionCached()).to.be.false;
		await requestAllRevisionViews(viewer, simpleLog);
		expect(viewer.highestRevisionCached()).to.be.true;
		simpleLog.addLocalEdit(
			newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					StablePlaceInternal.atEndOf(testTree.right.traitLocation)
				)
			)
		);
		simpleLog.addSequencedEdit(
			newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					StablePlaceInternal.atEndOf(testTree.right.traitLocation)
				)
			),
			{
				sequenceNumber: 3,
				referenceSequenceNumber: 2,
				minimumSequenceNumber: 2,
			}
		);
		expect(viewer.highestRevisionCached()).to.be.false;
	});

	it('evicts least recently set cached revision views for sequenced edits', async () => {
		let editsProcessed = 0;
		const log = getLogWithNumEdits(testTree, CachingLogViewer.sequencedCacheSizeMax * 2);
		const viewer = getCachingLogViewerAssumeAppliedEdits(
			log,
			expectDefined(RevisionView.fromTree(initialTree, testTree)),
			() => editsProcessed++
		);
		viewer.setMinimumSequenceNumber(log.length + 1); // simulate all edits being subject to eviction

		await requestAllRevisionViews(viewer, log);
		expect(editsProcessed).to.equal(log.length);

		editsProcessed = 0;
		for (let i = CachingLogViewer.sequencedCacheSizeMax + 1; i <= log.length; i++) {
			await viewer.getRevisionView(i);
		}
		expect(editsProcessed).to.equal(0);

		await viewer.getRevisionView(CachingLogViewer.sequencedCacheSizeMax);
		expect(editsProcessed).to.equal(CachingLogViewer.sequencedCacheSizeMax);
	});

	it('never evicts the revision view for the most recent sequenced edit', async () => {
		let editsProcessed = 0;
		const log = getLogWithNumEdits(testTree, CachingLogViewer.sequencedCacheSizeMax * 2);
		const viewer = getCachingLogViewerAssumeAppliedEdits(
			log,
			expectDefined(RevisionView.fromTree(initialTree, testTree)),
			() => editsProcessed++
		);

		// Simulate all clients being caught up.
		viewer.setMinimumSequenceNumber(log.numberOfSequencedEdits);

		await requestAllRevisionViews(viewer, log);
		expect(editsProcessed).to.equal(log.length);

		editsProcessed = 0;
		for (let i = 0; i <= CachingLogViewer.sequencedCacheSizeMax; i++) {
			await viewer.getRevisionView(i);
		}
		expect(editsProcessed).to.equal(CachingLogViewer.sequencedCacheSizeMax);

		editsProcessed = 0;
		await viewer.getRevisionView(log.numberOfSequencedEdits);
		expect(editsProcessed).to.equal(0);
	});

	it('caches revision views for local revisions', async () => {
		const logWithLocalEdits = getSimpleLogWithLocalEdits(testTree);
		let editsProcessed = 0;
		const viewer = getCachingLogViewerAssumeAppliedEdits(
			logWithLocalEdits,
			simpleLogBaseView,
			() => editsProcessed++
		);
		assert(logWithLocalEdits.length < CachingLogViewer.sequencedCacheSizeMax);

		await requestAllRevisionViews(viewer, logWithLocalEdits);
		expect(editsProcessed).to.equal(logWithLocalEdits.length);

		// Local edits should now be cached until next remote sequenced edit arrives
		editsProcessed = 0;
		for (let i = logWithLocalEdits.numberOfSequencedEdits + 1; i <= logWithLocalEdits.length; i++) {
			await viewer.getRevisionView(i);
			expect(editsProcessed).to.equal(0);
		}

		// Add a new local edit, and request the latest view.
		// This should apply only a single edit, as the most recent HEAD should be cached.
		editsProcessed = 0;
		logWithLocalEdits.addLocalEdit(
			newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					StablePlaceInternal.atEndOf(testTree.right.traitLocation)
				)
			)
		);
		await requestAllRevisionViews(viewer, logWithLocalEdits);
		expect(editsProcessed).to.equal(1);

		editsProcessed = 0;
		let seqNumber = 1;
		while (logWithLocalEdits.numberOfLocalEdits > 0) {
			logWithLocalEdits.addSequencedEdit(
				logWithLocalEdits.getEditInSessionAtIndex(logWithLocalEdits.numberOfSequencedEdits),
				{ sequenceNumber: seqNumber, referenceSequenceNumber: seqNumber - 1 }
			);
			++seqNumber;
			await viewer.getRevisionView(logWithLocalEdits.numberOfSequencedEdits); // get the latest (just added) sequenced edit
			await viewer.getRevisionView(Number.POSITIVE_INFINITY); // get the last view, which is a local revision
			expect(editsProcessed).to.equal(0);
		}
	});

	it('invalidates cached revision views for local revisions when remote edits are received', () => {
		const logWithLocalEdits = getSimpleLogWithLocalEdits(testTree);
		let editsProcessed = 0;
		const viewer = getCachingLogViewerAssumeAppliedEdits(
			logWithLocalEdits,
			simpleLogBaseView,
			() => editsProcessed++
		);

		// Request twice, should only process edits once
		viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(logWithLocalEdits.length);

		// Remote edit arrives
		editsProcessed = 0;
		logWithLocalEdits.addSequencedEdit(
			newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					StablePlaceInternal.atEndOf(testTree.right.traitLocation)
				)
			),
			{ sequenceNumber: 3, referenceSequenceNumber: 2, minimumSequenceNumber: 2 }
		);
		viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(logWithLocalEdits.numberOfLocalEdits + 1);
	});

	it('uses known editing result', () => {
		const log = new EditLog<ChangeInternal>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewerAssumeAppliedEdits(log, simpleLogBaseView, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const before = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(edit, {
			status: EditStatus.Applied,
			changes: edit.changes,
			before,
			after: arbitraryRevisionView,
			steps: [],
		});
		const after = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([true]);
		expect(after).equal(arbitraryRevisionView);
	});

	it('ignores known editing if for wrong before revision view', () => {
		const log = new EditLog<ChangeInternal>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewerAssumeAppliedEdits(log, simpleLogBaseView, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(edit, {
			status: EditStatus.Applied,
			changes: edit.changes,
			before: arbitraryRevisionView,
			after: arbitraryRevisionView,
			steps: [],
		});
		const after = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		expect(after).not.equal(arbitraryRevisionView);
	});

	it('ignores known editing if for wrong edit', () => {
		const log = new EditLog<ChangeInternal>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewerAssumeAppliedEdits(log, simpleLogBaseView, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const before = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(newEdit([]), {
			status: EditStatus.Applied,
			changes: edit.changes,
			before,
			after: arbitraryRevisionView,
			steps: [],
		});
		const after = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		expect(after).not.equal(arbitraryRevisionView);
	});

	it('uses known editing result with multiple edits', () => {
		const log = new EditLog<ChangeInternal>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewerAssumeAppliedEdits(log, simpleLogBaseView, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const edit1 = newEdit([]);
		const edit2 = newEdit([]);
		const edit3 = newEdit([]);
		log.addLocalEdit(edit1);

		const before = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		log.addLocalEdit(edit2);
		viewer.setKnownEditingResult(edit2, {
			status: EditStatus.Applied,
			changes: edit2.changes,
			before,
			after: arbitraryRevisionView,
			steps: [],
		});
		const after = viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false, true]);
		expect(after).equal(arbitraryRevisionView);
		log.addLocalEdit(edit3);
		viewer.getRevisionViewInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false, true, false]);
	});

	describe('Callbacks', () => {
		function getViewer(): {
			log: EditLog<ChangeInternal>;
			viewer: CachingLogViewer;
			events: SequencedEditResult[];
		} {
			const log = getTestTreeLog(testTree);
			const events: SequencedEditResult[] = [];
			const viewer = new CachingLogViewer(
				log,
				simpleLogBaseView,
				[],
				/* expensiveValidation */ true,
				undefined,
				(args: SequencedEditResult) => events.push(args)
			);
			return { log, viewer, events };
		}

		function addInvalidEdit(log: EditLog<ChangeInternal>): Edit<ChangeInternal> {
			// Add a local edit that will be invalid (inserts a node at a location that doesn't exist)
			const edit = newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					expectDefined(
						StablePlaceInternal.atEndOf({
							label: testTraitLabel,
							parent: testTree.generateNodeId(),
						})
					)
				)
			);
			log.addLocalEdit(edit);
			return edit;
		}

		it('processSequencedEditResult is called when a sequenced edit is applied', async () => {
			const { log, events, viewer } = getViewer();
			await viewer.getRevisionView(Number.POSITIVE_INFINITY);
			events.splice(0);

			// Non-sequenced edit should not trigger a call
			const invalidEdit = addInvalidEdit(log);
			await viewer.getRevisionView(Number.POSITIVE_INFINITY);
			expect(events.length).equals(0);

			log.addSequencedEdit(invalidEdit, { sequenceNumber: 3, referenceSequenceNumber: 2 });
			await viewer.getRevisionView(Number.POSITIVE_INFINITY);
			expect(events.length).equals(1);
			expect(events[0].edit.id).equals(invalidEdit.id);
			expect(events[0].wasLocal).equals(true);
			expect(events[0].result.status).equals(EditStatus.Invalid);
			expect(events[0].reconciliationPath.length).equals(0);

			const validEdit1 = newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					StablePlaceInternal.atStartOf(testTree.left.traitLocation)
				)
			);
			log.addSequencedEdit(validEdit1, { sequenceNumber: 3, referenceSequenceNumber: 2 });
			await viewer.getRevisionView(Number.POSITIVE_INFINITY);
			expect(events.length).equals(2);
			expect(events[1].edit.id).equals(validEdit1.id);
			expect(events[1].wasLocal).equals(false);
			expect(events[1].result.status).equals(EditStatus.Applied);
			expect(events[1].reconciliationPath.length).equals(0);

			const validEdit2 = newEdit(
				ChangeInternal.insertTree(
					[testTree.buildLeafInternal()],
					StablePlaceInternal.atStartOf(testTree.left.traitLocation)
				)
			);
			log.addSequencedEdit(validEdit2, { sequenceNumber: 4, referenceSequenceNumber: 2 });
			await viewer.getRevisionView(Number.POSITIVE_INFINITY);
			expect(events.length).equals(3);
			expect(events[2].edit.id).equals(validEdit2.id);
			expect(events[2].wasLocal).equals(false);
			expect(events[2].result.status).equals(EditStatus.Applied);
			expect(events[2].reconciliationPath.length).equals(1);
		});
	});

	describe('Sequencing', () => {
		function addFakeEdit(
			logViewer: CachingLogViewer,
			sequenceNumber: number,
			referenceSequenceNumber?: number
		): Edit<unknown> {
			const id = String(sequenceNumber ?? uuidv4()) as EditId;
			const edit = { changes: [ChangeInternal.setPayload(simpleLogBaseView.root, id)], id };
			logViewer.log.addSequencedEdit(edit, {
				sequenceNumber,
				referenceSequenceNumber: referenceSequenceNumber ?? sequenceNumber - 1,
			});
			return edit;
		}

		function minimalLogViewer(): CachingLogViewer {
			return new CachingLogViewer(new EditLog(), simpleLogBaseView, [], /* expensiveValidation */ true);
		}

		it('tracks the earliest sequenced edit in the session', () => {
			const logViewer = minimalLogViewer();
			expect(logViewer.earliestSequencedEditInSession()).undefined;

			// Non-sequenced edit
			logViewer.log.addLocalEdit({ id: uuidv4() as EditId, changes: [] });
			expect(logViewer.earliestSequencedEditInSession()).undefined;

			// First sequenced edit
			const edit = addFakeEdit(logViewer, 123);
			const expected = { edit, sequenceNumber: 123 };
			expect(logViewer.earliestSequencedEditInSession()).deep.equals(expected);

			// Non-sequenced edit
			logViewer.log.addLocalEdit({ id: uuidv4() as EditId, changes: [] });
			expect(logViewer.earliestSequencedEditInSession()).deep.equals(expected);

			// Second sequenced edit
			addFakeEdit(logViewer, 456);
			expect(logViewer.earliestSequencedEditInSession()).deep.equals(expected);
		});

		it('can provide edit results for sequenced edits', () => {
			const logViewer = minimalLogViewer();
			expect(logViewer.getEditResultFromSequenceNumber(42)).undefined;

			// Non-sequenced edit
			logViewer.log.addLocalEdit({ id: uuidv4() as EditId, changes: [] });
			expect(logViewer.getEditResultFromSequenceNumber(42)).undefined;

			// First sequenced edit
			const edit1 = addFakeEdit(logViewer, 123);
			expect(logViewer.getEditResultFromSequenceNumber(42)).undefined;
			const expected1 = {
				id: edit1.id,
			};
			expect(logViewer.getEditResultFromSequenceNumber(123)).contains(expected1);
			// Check that when no such sequence number exists, the closest earlier edit is returned
			expect(logViewer.getEditResultFromSequenceNumber(124)).contains(expected1);

			// Second sequenced edit
			// Note that this edit is given a greater sequence number than simply incrementing after edit 1.
			// This is deliberately done to simulate scenarios where a given DDS may not be sent all sequenced ops (because an other DDS
			// might be receiving them).
			const edit2 = addFakeEdit(logViewer, 456);
			expect(logViewer.getEditResultFromSequenceNumber(123)).contains(expected1);
			// Check that when no such sequence number exists, the closest earlier edit is returned
			expect(logViewer.getEditResultFromSequenceNumber(124)).contains(expected1);
			const expected2 = {
				id: edit2.id,
			};
			expect(logViewer.getEditResultFromSequenceNumber(456)).contains(expected2);
			// Check that when no such sequence number exists, the closest earlier edit is returned
			expect(logViewer.getEditResultFromSequenceNumber(457)).contains(expected2);
		});

		it('can provide the reconciliation path for an edit', () => {
			const logViewer = minimalLogViewer();

			function expectReconciliationPath(edit: Edit<unknown>, path: Edit<unknown>[]) {
				const actual = logViewer.reconciliationPathFromEdit(edit.id);
				expect(actual.length).equals(path.length);
				for (let i = 0; i < path.length; ++i) {
					expect(actual[i].length).equals(1);
					const change = actual[i][0].resolvedChange as SetValueInternal;
					expect(change.payload).equals(path[i].id);
				}
			}

			// Non-sequenced edit
			const nonSeqEdit = { id: uuidv4() as EditId, changes: [] };
			logViewer.log.addLocalEdit(nonSeqEdit);
			expectReconciliationPath(nonSeqEdit, []);

			const edit1 = addFakeEdit(logViewer, 1001);
			expectReconciliationPath(edit1, []);

			// Note that this edit is given a greater sequence number than simply incrementing after edit 1.
			// This is deliberately done to simulate scenarios where a given DDS may not be sent all sequenced ops (because an other DDS
			// might be receiving them).
			const edit2 = addFakeEdit(logViewer, 2001, 1001);
			expectReconciliationPath(edit2, []);

			const edit3 = addFakeEdit(logViewer, 3001, 2000);
			expectReconciliationPath(edit3, [edit2]);

			const edit4 = addFakeEdit(logViewer, 4001, 2500);
			expectReconciliationPath(edit4, [edit3]);

			const edit5 = addFakeEdit(logViewer, 5001, 500);
			expectReconciliationPath(edit5, [edit1, edit2, edit3, edit4]);
		});
	});
});
