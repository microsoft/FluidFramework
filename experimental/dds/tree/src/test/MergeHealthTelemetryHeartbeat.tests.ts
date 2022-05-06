/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { SharedTreeMergeHealthTelemetryHeartbeat } from '../MergeHealth';
import { SequencedEditAppliedEventArguments, SharedTree } from '../SharedTree';
import { RevisionView } from '../RevisionView';
import { Change, ChangeType, StablePlace, StableRange } from '../ChangeTypes';
import { ConstraintEffect, EditStatus } from '../persisted-types';
import { TransactionInternal } from '../TransactionInternal';
import { buildLeaf, TestTree } from './utilities/TestNode';
import { setUpTestSharedTree, setUpTestTree } from './utilities/TestUtilities';

async function setupHeartbeat() {
	const events: ITelemetryBaseEvent[] = [];
	const { tree, containerRuntimeFactory } = setUpTestSharedTree({
		localMode: false,
		logger: { send: (event) => events.push(event) },
		allowInvalid: true,
	});
	const testTree = setUpTestTree(tree);
	const { tree: concurrentTree } = setUpTestSharedTree({
		containerRuntimeFactory,
		id: 'secondTestSharedTree',
		localMode: false,
		allowInvalid: true,
	});
	const heartbeat = new SharedTreeMergeHealthTelemetryHeartbeat();
	containerRuntimeFactory.processAllMessages();
	await tree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
	heartbeat.attachTree(tree);
	return {
		tree,
		testTree,
		concurrentTree,
		containerRuntimeFactory,
		events,
		heartbeat,
	};
}

async function flush(tree: SharedTree, containerRuntimeFactory: MockContainerRuntimeFactory): Promise<RevisionView> {
	containerRuntimeFactory.processAllMessages();
	return tree.logViewer.getRevisionView(Number.POSITIVE_INFINITY);
}

function itAggregates(
	nameOfAggregatedData: string,
	paramFunc: (params: { tree: SharedTree; testTree: TestTree; concurrentTree: SharedTree }) => {
		edits: Change[][];
		concurrentEdits?: Change[][];
		action: (ITelemetryBaseEvent) => void;
	}
): Mocha.Test {
	return it(`Aggregates ${nameOfAggregatedData}`, async () => {
		const { tree, testTree, concurrentTree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		const params = paramFunc({ tree, testTree, concurrentTree });
		heartbeat.clearData();
		if (params.concurrentEdits !== undefined) {
			for (const edit of params.concurrentEdits) {
				concurrentTree.applyEdit(...edit);
			}
		}
		for (const edit of params.edits) {
			tree.applyEdit(...edit);
		}
		await flush(tree, containerRuntimeFactory);
		heartbeat.flushHeartbeat();
		expect(events.length).greaterThan(0);
		params.action(events[events.length - 1]);
	});
}

function itAggregatesMocked(
	nameOfAggregatedData: string,
	params: readonly Partial<Record<keyof SequencedEditAppliedEventArguments, unknown>>[],
	action: (ITelemetryBaseEvent) => void
): Mocha.Test {
	return it(`Aggregates mocked ${nameOfAggregatedData}`, () => {
		const events: ITelemetryBaseEvent[] = [];
		const logger = { send: (event) => events.push(event) };
		const heartbeat = new SharedTreeMergeHealthTelemetryHeartbeat();
		let savedListener!: (...args: any[]) => void;
		const mockTree = {
			on: (event: string, listener: (...args: any[]) => void) => {
				savedListener = listener;
			},
		};
		heartbeat.attachTree(mockTree as SharedTree);
		for (const param of params) {
			savedListener({
				tree: mockTree,
				logger,
				edit: {},
				reconciliationPath: [],
				steps: [],
				wasLocal: true,
				outcome: {
					status: EditStatus.Applied,
				},
				...param,
			});
		}
		heartbeat.flushHeartbeat();
		expect(events.length).greaterThan(0);
		const event = events[events.length - 1];
		action(event);
	});
}

describe('SharedTreeMergeHealthTelemetryHeartbeat', () => {
	it('Does not automatically send data synchronously', async () => {
		const { tree, testTree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		tree.applyEdit(...Change.insertTree([testTree.buildLeaf()], StablePlace.after(testTree.left)));
		await flush(tree, containerRuntimeFactory);
		// Expect some data to have made it to the heartbeat
		expect(heartbeat.getStats(tree).editCount).equals(1);
		// Expect no data was sent to the logger
		expect(events).deep.equals([]);
	});

	it('Can be flushed synchronously', async () => {
		const { tree, testTree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		tree.applyEdit(...Change.insertTree([testTree.buildLeaf()], StablePlace.after(testTree.left)));
		await flush(tree, containerRuntimeFactory);
		heartbeat.flushHeartbeat();
		expect(events.length).equals(1);
		expect(events[0]).contains({
			category: 'Heartbeat',
			eventName: 'SharedTree:SequencedEditApplied:EditMergeHealth',
		});
	});

	it('Does not send data if no local edits have been made', async () => {
		const { tree, testTree, concurrentTree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		concurrentTree.applyEdit(
			...Change.insertTree([buildLeaf()], StablePlace.after(testTree.left.translateId(concurrentTree)))
		);
		await flush(tree, containerRuntimeFactory);
		heartbeat.flushHeartbeat();
		expect(events.length).equals(0);
	});

	describe('Aggregates merge health data', () => {
		itAggregates('edit counts', ({ testTree }) => ({
			edits: [
				Change.insertTree([testTree.buildLeaf()], StablePlace.after(testTree.left)),
				Change.insertTree(
					[testTree.buildLeaf()],
					StablePlace.after(testTree.buildLeaf(testTree.generateNodeId()))
				),
			],
			action: (event) => {
				expect(event.editCount).equals(2);
				expect(event.failedEditCount).equals(1);
			},
		}));

		itAggregates('preventable place failures', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [[Change.delete(StableRange.only(testTree.left.translateId(concurrentTree)))]],
			edits: [Change.insertTree([testTree.buildLeaf()], StablePlace.after(testTree.left))],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badPlaceCount).equals(1);
				expect(event.deletedSiblingBadPlaceCount).equals(1);
				expect(event.deletedAncestorBadPlaceCount).equals(0);
			},
		}));

		itAggregates(
			'failures for the parent of a sibling-based place being deleted',
			({ testTree, concurrentTree }) => ({
				concurrentEdits: [[Change.delete(StableRange.only(testTree.translateId(concurrentTree)))]],
				edits: [Change.insertTree([testTree.buildLeaf()], StablePlace.after(testTree.left))],
				action: (event) => {
					expect(event.failedEditCount).equals(1);
					expect(event.badPlaceCount).equals(1);
					expect(event.deletedSiblingBadPlaceCount).equals(1);
					expect(event.deletedAncestorBadPlaceCount).equals(0);
				},
			})
		);

		itAggregates(
			'failures for a range made of valid places in different traits',
			({ testTree, concurrentTree }) => ({
				// Move the "right" node to another trait to make the range invalid
				concurrentEdits: [
					Change.move(
						StableRange.only(testTree.left.translateId(concurrentTree)),
						StablePlace.atEndOf(testTree.right.traitLocation.translate(concurrentTree))
					),
				],
				edits: [
					[
						Change.delete(
							StableRange.from(StablePlace.before(testTree.left)).to(
								StablePlace.atEndOf(testTree.left.traitLocation)
							)
						),
					],
				],
				action: (event) => {
					expect(event.failedEditCount).equals(1);
					expect(event.badRangeCount).equals(1);
					expect(event.deletedSiblingBadRangeCount).equals(0);
					expect(event.updatedRangeHasPlacesInDifferentTraitsCount).equals(1);
				},
			})
		);

		itAggregates('failures for a range made of valid places that are inverted', ({ testTree, concurrentTree }) => ({
			// Move the "right" node to the start of the trait to make the range inverted
			concurrentEdits: [
				Change.move(
					StableRange.only(testTree.right.translateId(concurrentTree)),
					StablePlace.atStartOf(testTree.left.traitLocation.translate(concurrentTree))
				),
			],
			edits: [
				[
					Change.delete(
						StableRange.from(StablePlace.after(testTree.left)).to(StablePlace.before(testTree.right))
					),
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badRangeCount).equals(1);
				expect(event.deletedSiblingBadRangeCount).equals(0);
				expect(event.updatedRangeInvertedCount).equals(1);
			},
		}));

		itAggregates(
			'failures for the parent of a parent-based place being deleted',
			({ testTree, concurrentTree }) => ({
				concurrentEdits: [[Change.delete(StableRange.only(testTree.left.translateId(concurrentTree)))]],
				edits: [
					Change.insertTree(
						[testTree.buildLeaf()],
						StablePlace.atStartOf({ parent: testTree.left.identifier, label: testTree.left.traitLabel })
					),
				],
				action: (event) => {
					expect(event.failedEditCount).equals(1);
					expect(event.badPlaceCount).equals(1);
					expect(event.deletedSiblingBadPlaceCount).equals(0);
					expect(event.deletedAncestorBadPlaceCount).equals(1);
				},
			})
		);

		itAggregates('preventable range failures', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [[Change.delete(StableRange.only(testTree.left.translateId(concurrentTree)))]],
			edits: [[Change.delete(StableRange.only(testTree.left))]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badRangeCount).equals(1);
			},
		}));

		itAggregates('range constraint violations', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [[Change.delete(StableRange.only(testTree.left.translateId(concurrentTree)))]],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.only(testTree.left),
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.rangeConstraintViolationCount).equals(1);
			},
		}));

		itAggregates('length constraint violations', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [
				Change.move(
					StableRange.only(testTree.right.translateId(concurrentTree)),
					StablePlace.after(testTree.left.translateId(concurrentTree))
				),
			],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.all(testTree.left.traitLocation),
						length: 1,
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.lengthConstraintViolationCount).equals(1);
			},
		}));

		itAggregates('parent constraint violations', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [
				Change.move(
					StableRange.only(testTree.right.translateId(concurrentTree)),
					StablePlace.atStartOf({
						parent: testTree.left.translateId(concurrentTree),
						label: testTree.left.traitLabel,
					})
				),
			],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.only(testTree.right),
						parentNode: testTree.identifier,
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.parentConstraintViolationCount).equals(1);
			},
		}));

		itAggregates('label constraint violations', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [
				Change.move(
					StableRange.only(testTree.left.translateId(concurrentTree)),
					StablePlace.after(testTree.right.translateId(concurrentTree))
				),
			],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.only(testTree.left),
						label: testTree.left.traitLabel,
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.labelConstraintViolationCount).equals(1);
			},
		}));

		itAggregates('failures due to ID collisions', ({ testTree, concurrentTree }) => {
			const duplicateOverride = 'duplicate ID';
			return {
				concurrentEdits: [
					Change.insertTree(
						[buildLeaf(concurrentTree.generateNodeId(duplicateOverride))],
						StablePlace.after(testTree.left.translateId(concurrentTree))
					),
				],
				edits: [
					Change.insertTree(
						[testTree.buildLeaf(testTree.generateNodeId(duplicateOverride))],
						StablePlace.after(testTree.left)
					),
				],
				action: (event) => {
					expect(event.failedEditCount).equals(1);
					expect(event.idAlreadyInUseCount).equals(1);
				},
			};
		});

		itAggregates('failures due unknown IDs', ({ testTree, concurrentTree }) => ({
			concurrentEdits: [[Change.delete(StableRange.only(testTree.left.translateId(concurrentTree)))]],
			edits: [[Change.clearPayload(testTree.left.identifier)]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.unknownIdCount).equals(1);
			},
		}));

		// This test uses itAggregatesMocked to streamline the test code
		itAggregatesMocked(
			'path length',
			[
				{ reconciliationPath: { length: 0 } },
				{ reconciliationPath: { length: 1 } },
				{ reconciliationPath: { length: 1 } },
				{ reconciliationPath: { length: 2 } },
				{ reconciliationPath: { length: 42 } },
			],
			(event) => {
				expect(event.pathLengths).equals('0:1,1:2,2:1,42:1');
			}
		);

		// This test uses itAggregatesMocked because multiple attempts are currently not being made
		itAggregatesMocked(
			'maximum attempt number for an edit',
			[
				{
					edit: { pastAttemptCount: 40 },
				},
				{
					edit: { pastAttemptCount: 42 },
				},
				{
					edit: { pastAttemptCount: 41 },
				},
			],
			(event) => {
				expect(event.maxAttemptCount).equals(42);
			}
		);

		// This test uses itAggregatesMocked because there should be no way for a sequenced edit to become a malformed edit in
		// the face of concurrent edits.
		itAggregatesMocked(
			'failures due malformed edits',
			[
				{
					outcome: {
						status: EditStatus.Malformed,
						failure: { kind: TransactionInternal.FailureKind.UnusedDetachedSequence },
					},
				},
			],
			(event) => {
				// This test has to mock a lot of things because there should be no way for a sequenced edit to become a malformed edit in the
				// face of concurrent edits.
				expect(event.failedEditCount).equals(1);
				expect(event.malformedEditCount).equals(1);
			}
		);
	});
});
