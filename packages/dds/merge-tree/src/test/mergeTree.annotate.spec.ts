/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import {
	LocalClientId,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { Marker, type ISegmentPrivate, type OperationStamp } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { assertMergeNode } from "../segmentInfos.js";
import type { PropsOrAdjust } from "../segmentPropertiesManager.js";
import { TextSegment } from "../textSegment.js";

import { insertSegments } from "./testUtils.js";
import { LocalDefaultPerspective, PriorPerspective } from "../perspective.js";

function mintLocalChange(tree: MergeTree): OperationStamp {
	return {
		seq: UnassignedSequenceNumber,
		clientId: tree.collabWindow.clientId,
		localSeq: ++tree.collabWindow.currentSeq,
	};
}

function splitAt(mergeTree: MergeTree, pos: number): ISegmentPrivate | undefined {
	let segment: ISegmentPrivate | undefined;
	mergeTree.mapRange(
		(seg) => {
			segment = seg;
			return false;
		},
		new LocalDefaultPerspective(mergeTree.collabWindow.clientId),
		undefined,
		pos,
		pos + 1,
		true,
	);
	return segment;
}

describe("MergeTree", () => {
	let mergeTree: MergeTree;
	const remoteClientId = 35;
	const localClientId = 17;
	let currentSequenceNumber: number;

	const annotateStart = 1;
	const markerPosition = annotateStart + 2;
	const annotateEnd = markerPosition + 2;
	const splitPos = Math.floor((annotateEnd - annotateStart) / 2) + annotateStart;

	beforeEach(() => {
		mergeTree = new MergeTree();
		insertSegments({
			mergeTree,
			pos: 0,
			segments: [TextSegment.make("hello world!")],
			refSeq: UniversalSequenceNumber,
			clientId: LocalClientId,
			seq: UniversalSequenceNumber,
			opArgs: undefined as never,
		});

		currentSequenceNumber = 0;
		insertSegments({
			mergeTree,
			pos: markerPosition,
			segments: [Marker.make(ReferenceType.Tile)],
			refSeq: currentSequenceNumber,
			clientId: remoteClientId,
			seq: ++currentSequenceNumber,
			opArgs: undefined as never,
		});
	});

	describe("annotateRange", () => {
		describe("not collaborating", () => {
			it("remote", () => {
				mergeTree.annotateRange(
					annotateStart,
					annotateEnd,
					{
						props: { propertySource: "remote" },
					},
					new PriorPerspective(currentSequenceNumber, remoteClientId),
					{ seq: currentSequenceNumber + 1, clientId: remoteClientId },
					undefined as never,
				);

				const segmentInfo = mergeTree.getContainingSegment(
					annotateStart,
					mergeTree.localPerspective,
				);
				const segment = segmentInfo.segment as ISegmentPrivate;
				assert.equal(segment?.properties?.propertySource, "remote");
			});

			it("local", () => {
				mergeTree.annotateRange(
					annotateStart,
					annotateEnd,
					{
						props: { propertySource: "local" },
					},
					mergeTree.localPerspective,
					mintLocalChange(mergeTree),
					undefined as never,
				);

				const segmentInfo = mergeTree.getContainingSegment(
					annotateStart,
					mergeTree.localPerspective,
				);
				const segment = segmentInfo.segment as ISegmentPrivate;
				assert.equal(segment.properties?.propertySource, "local");
			});
		});
		describe("collaborating", () => {
			beforeEach(() => {
				mergeTree.startCollaboration(
					localClientId,
					/* minSeq: */ currentSequenceNumber,
					/* currentSeq: */ currentSequenceNumber,
				);
			});
			describe("local first", () => {
				const props: PropsOrAdjust = {
					props: { propertySource: "local" },
				};
				beforeEach(() => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);
				});

				it("unsequenced local", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;
					assert.equal(segment.properties?.propertySource, "local");
				});

				it("unsequenced local after unsequenced local", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { secondProperty: "local" },
						},
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;
					assert.equal(segment.properties?.secondProperty, "local");
				});

				it("unsequenced local split", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const splitSegment = splitAt(mergeTree, splitPos)!;
					assertMergeNode(splitSegment);
					assert.notEqual(segmentInfo.segment?.ordinal, splitSegment.ordinal);
					assert.equal(splitSegment.properties?.propertySource, "local");
				});

				it("unsequenced local after unsequenced local split", () => {
					const secondChangeProps: PropsOrAdjust = {
						props: {
							secondChange: 1,
						},
					};
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						secondChangeProps,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					const splitOnlyProps: PropsOrAdjust = {
						props: {
							splitOnly: 1,
						},
					};

					mergeTree.annotateRange(
						splitPos,
						annotateEnd,
						splitOnlyProps,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					const splitSegmentInfo = mergeTree.getContainingSegment(
						splitPos,
						mergeTree.localPerspective,
					);
					const splitSegment = splitSegmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.segmentGroups?.size, 2);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups?.size, 3);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert.equal(segment.segmentGroups?.size, 1);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment?.segmentGroups?.size, 2);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...secondChangeProps,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert.equal(segment.segmentGroups?.size, 0);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups?.size, 1);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: splitPos,
							pos2: annotateEnd,
							...splitOnlyProps,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert.equal(segment.segmentGroups?.size, 0);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups?.size, 0);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);
				});

				it("unsequenced local before remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteProperty: 1 },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.segmentGroups?.size, 1);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("sequenced local", () => {
					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;
					assert.equal(segment.segmentGroups?.size, 0);
					assert.equal(segment.properties?.propertySource, "local");
				});

				it("sequenced local before remote", () => {
					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteProperty: 1 },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.segmentGroups?.size, 0);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("three local changes", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.properties?.propertySource, "local");

					const props2: PropsOrAdjust = {
						props: { propertySource: "local2", secondSource: 1 },
					};
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props2,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);

					const props3: PropsOrAdjust = {
						props: {
							thirdSource: 1,
						},
					};
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props3,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props2,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props3,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);
				});

				it("two local changes with interleaved remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { secondSource: "local2" },
						},
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteOnly: 1, secondSource: "remote" },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.properties?.remoteOnly, 1);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.secondSource, "local2");
				});
			});
			describe("remote first", () => {
				beforeEach(() => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteProperty: 1 },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					assert(segmentInfo.segment?.segmentGroups?.size !== 0);
				});
				it("remote only", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("split remote", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const splitSegment = splitAt(mergeTree, annotateStart + 1)!;
					assertMergeNode(splitSegment);
					assert.notEqual(segmentInfo.segment?.ordinal, splitSegment.ordinal);
					assert.equal(splitSegment.properties?.propertySource, "remote");
					assert.equal(splitSegment.properties?.remoteProperty, 1);
				});

				it("remote before unsequenced local", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "local" },
						},
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("remote before sequenced local", () => {
					const props: PropsOrAdjust = {
						props: { propertySource: "local" },
					};

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					assert(segmentInfo.segment?.segmentGroups?.empty !== false);

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					assert.equal(segmentInfo.segment?.segmentGroups?.size, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					assert(segmentInfo.segment?.segmentGroups?.empty);
					assert.equal(segmentInfo.segment?.properties?.propertySource, "local");
					assert.equal(segmentInfo.segment?.properties?.remoteProperty, 1);
				});
			});
			describe("local with rewrite first", () => {
				const props: PropsOrAdjust = {
					props: { propertySource: "local" },
				};
				beforeEach(() => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props,
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);
				});

				it("unsequenced local after unsequenced local", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "local2", secondProperty: "local" },
						},
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;
					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondProperty, "local");
				});

				it("unsequenced local before remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteProperty: 1 },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.segmentGroups?.size, 1);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("sequenced local before remote", () => {
					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteProperty: 1 },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.segmentGroups?.size, 0);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("two local changes with interleaved remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { secondSource: "local2" },
						},
						mergeTree.localPerspective,
						mintLocalChange(mergeTree),
						undefined as never,
					);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							...props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as unknown as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							props: { propertySource: "remote", remoteOnly: 1, secondSource: "remote" },
						},
						new PriorPerspective(currentSequenceNumber, remoteClientId),
						{ seq: ++currentSequenceNumber, clientId: remoteClientId },
						undefined as never,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						mergeTree.localPerspective,
					);
					const segment = segmentInfo.segment as ISegmentPrivate;

					assert.equal(segment.properties?.remoteOnly, 1);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.secondSource, "local2");
				});
			});
		});
	});
});
