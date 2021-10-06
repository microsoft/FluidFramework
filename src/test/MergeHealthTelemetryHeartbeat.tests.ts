/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { RevisionView } from '../TreeView';
import { NodeId } from '../Identifiers';
import { ChangeNode, EditStatus, SequencedEditAppliedEventArguments } from '../generic';
import {
	Change,
	ChangeType,
	Delete,
	Insert,
	StablePlace,
	StableRange,
	SharedTree,
	Move,
	ConstraintEffect,
	Transaction,
} from '../default-edits';
import { SharedTreeMergeHealthTelemetryHeartbeat } from '../MergeHealth';
import {
	setUpTestSharedTree,
	makeEmptyNode,
	left,
	right,
	leftTraitLabel,
	leftTraitLocation,
	rightTraitLocation,
	simpleTestTree,
	rootNodeId,
	makeTestNode,
} from './utilities/TestUtilities';

async function setupHeartbeat(initialTree: ChangeNode = simpleTestTree) {
	const events: ITelemetryBaseEvent[] = [];
	const { tree, containerRuntimeFactory } = setUpTestSharedTree({
		initialTree,
		localMode: false,
		logger: { send: (event) => events.push(event) },
		allowInvalid: true,
	});
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
	params: {
		initialTree?: ChangeNode;
		edits: Change[][];
		concurrentEdits?: Change[][];
		action: (ITelemetryBaseEvent) => void;
	}
): Mocha.Test {
	return it(`Aggregates ${nameOfAggregatedData}`, async () => {
		const { tree, concurrentTree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat(
			params.initialTree
		);
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
	params: readonly Partial<Record<keyof SequencedEditAppliedEventArguments<SharedTree>, unknown>>[],
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

const traitUnderLeftNode = { parent: left.identifier, label: leftTraitLabel };

describe('SharedTreeMergeHealthTelemetryHeartbeat', () => {
	it('Does not automatically send data synchronously', async () => {
		const { tree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		tree.applyEdit(...Insert.create([makeEmptyNode()], StablePlace.after(left)));
		await flush(tree, containerRuntimeFactory);
		// Expect some data to have made it to the heartbeat
		expect(heartbeat.getStats(tree).editCount).equals(1);
		// Expect no data was sent to the logger
		expect(events).deep.equals([]);
	});

	it('Can be flushed synchronously', async () => {
		const { tree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		tree.applyEdit(...Insert.create([makeEmptyNode()], StablePlace.after(left)));
		await flush(tree, containerRuntimeFactory);
		heartbeat.flushHeartbeat();
		expect(events.length).equals(1);
		expect(events[0]).contains({
			category: 'Heartbeat',
			eventName: 'SharedTree:SequencedEditApplied:EditMergeHealth',
		});
	});

	it('Does not send data if no local edits have been made', async () => {
		const { tree, concurrentTree, containerRuntimeFactory, events, heartbeat } = await setupHeartbeat();
		concurrentTree.applyEdit(...Insert.create([makeEmptyNode()], StablePlace.after(left)));
		await flush(tree, containerRuntimeFactory);
		heartbeat.flushHeartbeat();
		expect(events.length).equals(0);
	});

	describe('Aggregates merge health data', () => {
		itAggregates('edit counts', {
			edits: [
				Insert.create([makeEmptyNode()], StablePlace.after(left)),
				Insert.create([makeEmptyNode()], StablePlace.after(makeEmptyNode())),
			],
			action: (event) => {
				expect(event.editCount).equals(2);
				expect(event.failedEditCount).equals(1);
			},
		});

		itAggregates('preventable place failures', {
			concurrentEdits: [[Delete.create(StableRange.only(left))]],
			edits: [Insert.create([makeEmptyNode()], StablePlace.after(left))],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badPlaceCount).equals(1);
				expect(event.deletedSiblingBadPlaceCount).equals(1);
				expect(event.deletedAncestorBadPlaceCount).equals(0);
			},
		});

		itAggregates('failures for the parent of a parent-based place being deleted', {
			concurrentEdits: [[Delete.create(StableRange.only(left))]],
			edits: [Insert.create([makeEmptyNode()], StablePlace.atStartOf(traitUnderLeftNode))],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badPlaceCount).equals(1);
				expect(event.deletedSiblingBadPlaceCount).equals(0);
				expect(event.deletedAncestorBadPlaceCount).equals(1);
			},
		});

		itAggregates('failures for the parent of a sibling-based place being deleted', {
			concurrentEdits: [[Delete.create(StableRange.only(rootNodeId))]],
			edits: [Insert.create([makeEmptyNode()], StablePlace.after(left))],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badPlaceCount).equals(1);
				expect(event.deletedSiblingBadPlaceCount).equals(0);
				expect(event.deletedAncestorBadPlaceCount).equals(1);
			},
		});

		itAggregates('preventable range failures', {
			concurrentEdits: [[Delete.create(StableRange.only(left))]],
			edits: [[Delete.create(StableRange.only(left))]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badRangeCount).equals(1);
				expect(event.deletedSiblingBadRangeCount).equals(1);
				expect(event.deletedAncestorBadRangeCount).equals(0);
			},
		});

		itAggregates('failures for the parent of a range being deleted', {
			concurrentEdits: [[Delete.create(StableRange.only(left))]],
			edits: [[Delete.create(StableRange.all(traitUnderLeftNode))]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badRangeCount).equals(1);
				expect(event.deletedSiblingBadRangeCount).equals(0);
				expect(event.deletedAncestorBadRangeCount).equals(1);
			},
		});

		itAggregates('failures for a range made of valid places in different traits', {
			initialTree: {
				...makeEmptyNode(rootNodeId),
				traits: { [leftTraitLabel]: [left, right] },
			},
			// Move the "right" node to another trait to make the range invalid
			concurrentEdits: [Move.create(StableRange.only(right), StablePlace.atEndOf(rightTraitLocation))],
			edits: [[Delete.create(StableRange.from(StablePlace.before(left)).to(StablePlace.after(right)))]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badRangeCount).equals(1);
				expect(event.deletedSiblingBadRangeCount).equals(0);
				expect(event.updatedRangeHasPlacesInDifferentTraitsCount).equals(1);
			},
		});

		itAggregates('failures for a range made of valid places that are inverted', {
			initialTree: {
				...makeEmptyNode(rootNodeId),
				traits: { [leftTraitLabel]: [makeEmptyNode(), left, right] },
			},
			// Move the "right" node to the start of the trait to make the range inverted
			concurrentEdits: [Move.create(StableRange.only(right), StablePlace.atStartOf(leftTraitLocation))],
			edits: [[Delete.create(StableRange.from(StablePlace.before(left)).to(StablePlace.after(right)))]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.badRangeCount).equals(1);
				expect(event.deletedSiblingBadRangeCount).equals(0);
				expect(event.updatedRangeInvertedCount).equals(1);
			},
		});

		itAggregates('range constraint violations', {
			concurrentEdits: [[Delete.create(StableRange.only(left))]],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.only(left),
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.rangeConstraintViolationCount).equals(1);
			},
		});

		itAggregates('length constraint violations', {
			concurrentEdits: [Move.create(StableRange.only(right), StablePlace.after(left))],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.all(leftTraitLocation),
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
		});

		itAggregates('parent constraint violations', {
			concurrentEdits: [Move.create(StableRange.only(right), StablePlace.atStartOf(traitUnderLeftNode))],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.only(right),
						parentNode: rootNodeId,
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.parentConstraintViolationCount).equals(1);
			},
		});

		itAggregates('label constraint violations', {
			concurrentEdits: [Move.create(StableRange.only(left), StablePlace.after(right))],
			edits: [
				[
					{
						type: ChangeType.Constraint,
						toConstrain: StableRange.only(left),
						label: leftTraitLocation.label,
						effect: ConstraintEffect.InvalidAndDiscard,
					},
				],
			],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.constraintViolationCount).equals(1);
				expect(event.labelConstraintViolationCount).equals(1);
			},
		});

		itAggregates('failures due to ID collisions', {
			concurrentEdits: [Insert.create([makeTestNode('mockId' as NodeId)], StablePlace.after(left))],
			edits: [Insert.create([makeTestNode('mockId' as NodeId)], StablePlace.after(left))],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.idAlreadyInUseCount).equals(1);
			},
		});

		itAggregates('failures due unknown IDs', {
			concurrentEdits: [[Delete.create(StableRange.only(left))]],
			edits: [[Change.clearPayload(left.identifier)]],
			action: (event) => {
				expect(event.failedEditCount).equals(1);
				expect(event.unknownIdCount).equals(1);
			},
		});

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
						failure: { kind: Transaction.FailureKind.UnusedDetachedSequence },
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
