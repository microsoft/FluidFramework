/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants.js";
import { BaseSegment, Marker } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { TextSegment } from "../textSegment.js";
import { MergeTree } from "../mergeTree.js";
import { insertSegments } from "./testUtils.js";

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
			opArgs: undefined as any,
		});

		currentSequenceNumber = 0;
		insertSegments({
			mergeTree,
			pos: markerPosition,
			segments: [Marker.make(ReferenceType.Tile)],
			refSeq: currentSequenceNumber,
			clientId: remoteClientId,
			seq: ++currentSequenceNumber,
			opArgs: undefined as any,
		});
	});

	describe("annotateRange", () => {
		describe("not collaborating", () => {
			it("remote", () => {
				mergeTree.annotateRange(
					annotateStart,
					annotateEnd,
					{
						propertySource: "remote",
					},
					currentSequenceNumber,
					remoteClientId,
					currentSequenceNumber + 1,
					undefined as any,
				);

				const segmentInfo = mergeTree.getContainingSegment(
					annotateStart,
					currentSequenceNumber,
					localClientId,
				);
				const segment = segmentInfo.segment as BaseSegment;
				assert.equal(segment?.properties?.propertySource, "remote");
			});

			it("local", () => {
				mergeTree.annotateRange(
					annotateStart,
					annotateEnd,
					{
						propertySource: "local",
					},
					currentSequenceNumber,
					localClientId,
					UnassignedSequenceNumber,
					undefined as any,
				);

				const segmentInfo = mergeTree.getContainingSegment(
					annotateStart,
					currentSequenceNumber,
					localClientId,
				);
				const segment = segmentInfo.segment as BaseSegment;
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
				const props = {
					propertySource: "local",
				};
				beforeEach(() => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);
				});

				it("unsequenced local", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;
					assert.equal(segment.properties?.propertySource, "local");
				});

				it("unsequenced local after unsequenced local", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							secondProperty: "local",
						},
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;
					assert.equal(segment.properties?.secondProperty, "local");
				});

				it("unsequenced local split", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					const splitSegment = segment.splitAt(splitPos) as BaseSegment;

					assert.equal(splitSegment.properties?.propertySource, "local");
				});

				it("unsequenced local after unsequenced local split", () => {
					const secondChangeProps = {
						secondChange: 1,
					};
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						secondChangeProps,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					const splitOnlyProps = {
						splitOnly: 1,
					};

					mergeTree.annotateRange(
						splitPos,
						annotateEnd,
						splitOnlyProps,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					const splitSegmentInfo = mergeTree.getContainingSegment(
						splitPos,
						currentSequenceNumber,
						localClientId,
					);
					const splitSegment = splitSegmentInfo.segment as BaseSegment;

					assert.equal(segment.segmentGroups.size, 2);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups.size, 3);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					assert.equal(segment.segmentGroups.size, 1);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups.size, 2);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props: secondChangeProps,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					assert.equal(segment.segmentGroups.size, 0);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups.size, 1);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: splitPos,
							pos2: annotateEnd,
							props: splitOnlyProps,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					assert.equal(segment.segmentGroups.size, 0);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.secondChange, 1);
					assert(!segment.properties?.splitOnly);

					assert.equal(splitSegment.segmentGroups.size, 0);
					assert.equal(splitSegment.properties?.propertySource, "local");
					assert.equal(splitSegment.properties?.secondChange, 1);
					assert.equal(splitSegment.properties?.splitOnly, 1);
				});

				it("unsequenced local before remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "remote",
							remoteProperty: 1,
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					assert.equal(segment.segmentGroups.size, 1);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("sequenced local", () => {
					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;
					assert.equal(segment.segmentGroups.size, 0);
					assert.equal(segment.properties?.propertySource, "local");
				});

				it("sequenced local before remote", () => {
					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "remote",
							remoteProperty: 1,
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					assert.equal(segment.segmentGroups.size, 0);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("three local changes", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					assert.equal(segment.properties?.propertySource, "local");

					const props2 = {
						propertySource: "local2",
						secondSource: 1,
					};
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props2,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);

					const props3 = {
						thirdSource: 1,
					};
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props3,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props: props2,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondSource, 1);
					assert.equal(segment.properties?.thirdSource, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props: props3,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
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
							secondSource: "local2",
						},
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "remote",
							remoteOnly: 1,
							secondSource: "remote",
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

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
							propertySource: "remote",
							remoteProperty: 1,
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					assert(segmentInfo.segment?.segmentGroups.empty);
				});
				it("remote only", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("split remote", () => {
					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					const splitSegment = segment.splitAt(1) as BaseSegment;
					assert.equal(splitSegment.properties?.propertySource, "remote");
					assert.equal(splitSegment.properties?.remoteProperty, 1);
				});

				it("remote before unsequenced local", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "local",
						},
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("remote before sequenced local", () => {
					const props = {
						propertySource: "local",
					};

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					assert(segmentInfo.segment?.segmentGroups.empty);

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					assert.equal(segmentInfo.segment?.segmentGroups.size, 1);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					assert(segmentInfo.segment?.segmentGroups.empty);
					assert.equal(segmentInfo.segment?.properties?.propertySource, "local");
					assert.equal(segmentInfo.segment?.properties?.remoteProperty, 1);
				});
			});
			describe("local with rewrite first", () => {
				const props = {
					propertySource: "local",
				};
				beforeEach(() => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						props,
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);
				});

				it("unsequenced local after unsequenced local", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "local2",
							secondProperty: "local",
						},
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;
					assert.equal(segment.properties?.propertySource, "local2");
					assert.equal(segment.properties?.secondProperty, "local");
				});

				it("unsequenced local before remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "remote",
							remoteProperty: 1,
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					assert.equal(segment.segmentGroups.size, 1);
					assert.equal(segment.properties?.propertySource, "local");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("sequenced local before remote", () => {
					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "remote",
							remoteProperty: 1,
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					assert.equal(segment.segmentGroups.size, 0);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.remoteProperty, 1);
				});

				it("two local changes with interleaved remote", () => {
					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							secondSource: "local2",
						},
						currentSequenceNumber,
						localClientId,
						UnassignedSequenceNumber,
						undefined as any,
					);

					mergeTree.ackPendingSegment({
						op: {
							pos1: annotateStart,
							pos2: annotateEnd,
							props,
							type: MergeTreeDeltaType.ANNOTATE,
						},
						sequencedMessage: {
							sequenceNumber: ++currentSequenceNumber,
						} as any as ISequencedDocumentMessage,
					});

					mergeTree.annotateRange(
						annotateStart,
						annotateEnd,
						{
							propertySource: "remote",
							remoteOnly: 1,
							secondSource: "remote",
						},
						currentSequenceNumber,
						remoteClientId,
						++currentSequenceNumber,
						undefined as any,
					);

					const segmentInfo = mergeTree.getContainingSegment(
						annotateStart,
						currentSequenceNumber,
						localClientId,
					);
					const segment = segmentInfo.segment as BaseSegment;

					assert.equal(segment.properties?.remoteOnly, 1);
					assert.equal(segment.properties?.propertySource, "remote");
					assert.equal(segment.properties?.secondSource, "local2");
				});
			});
		});
	});
});
