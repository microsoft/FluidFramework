/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */

import assert from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { TextSegment } from "../";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { BaseSegment, Marker, MergeTree } from "../mergeTree";
import { ICombiningOp, MergeTreeDeltaType, ReferenceType } from "../ops";

describe("MergeTree", () => {
    let mergeTree: MergeTree;
    const remoteClientId = 35;
    const localClientId = 17;
    let currentSequenceNumber: number;
    const branchId = 0;

    const annotateStart = 1;
    const markerPosition = annotateStart + 2;
    const annotateEnd = markerPosition + 2;
    const splitPos = Math.floor((annotateEnd - annotateStart) / 2) + annotateStart;

    beforeEach(() => {
        mergeTree = new MergeTree();
        mergeTree.insertSegments(
            0,
            [TextSegment.make("hello world!")],
            UniversalSequenceNumber,
            LocalClientId,
            UniversalSequenceNumber,
            undefined);

        currentSequenceNumber = 0;
        mergeTree.insertSegments(
            markerPosition,
            [Marker.make(ReferenceType.Tile)],
            currentSequenceNumber,
            remoteClientId,
            ++currentSequenceNumber,
            undefined);
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
                    undefined,
                    currentSequenceNumber,
                    remoteClientId,
                    currentSequenceNumber + 1,
                    undefined);

                const segmentInfo =
                    mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                const segment = segmentInfo.segment as BaseSegment;
                assert.equal(segment.properties.propertySource, "remote");
            });

            it("local", () => {
                mergeTree.annotateRange(
                    annotateStart,
                    annotateEnd,
                    {
                        propertySource: "local",
                    },
                    undefined,
                    currentSequenceNumber,
                    localClientId,
                    UnassignedSequenceNumber,
                    undefined);

                const segmentInfo =
                    mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                const segment = segmentInfo.segment as BaseSegment;
                assert.equal(segment.properties.propertySource, "local");
            });
        });
        describe("collaborating", () => {
            beforeEach(() => {
                mergeTree.startCollaboration(
                    localClientId,
                    /* minSeq: */ currentSequenceNumber,
                    /* currentSeq: */ currentSequenceNumber,
                    branchId);
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
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);
                });

                it("unsequenced local", () => {
                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;
                    assert.equal(segment.properties.propertySource, "local");
                });

                it("unsequenced local after unsequenced local", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            secondProperty: "local",
                        },
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;
                    assert.equal(segment.properties.secondProperty, "local");
                });

                it("unsequenced local split", () => {
                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    const splitSegment = segment.splitAt(splitPos) as BaseSegment;

                    assert.equal(splitSegment.properties.propertySource, "local");
                });

                it("unsequenced local after unsequenced local split", () => {
                    const secondChangeProps = {
                        secondChange: 1,
                    };
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        secondChangeProps,
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    const splitOnlyProps = {
                        splitOnly: 1,
                    };

                    mergeTree.annotateRange(
                        splitPos,
                        annotateEnd,
                        splitOnlyProps,
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    const splitSegmentInfo =
                        mergeTree.getContainingSegment(splitPos, currentSequenceNumber, localClientId);
                    const splitSegment = splitSegmentInfo.segment as BaseSegment;

                    assert.equal(segment.segmentGroups.size, 2);
                    assert.equal(segment.properties.propertySource, "local");
                    assert.equal(segment.properties.secondChange, 1);
                    assert(!segment.properties.splitOnly);

                    assert.equal(splitSegment.segmentGroups.size, 3);
                    assert.equal(splitSegment.properties.propertySource, "local");
                    assert.equal(splitSegment.properties.secondChange, 1);
                    assert.equal(splitSegment.properties.splitOnly, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert.equal(segment.segmentGroups.size, 1);
                    assert.equal(segment.properties.propertySource, "local");
                    assert.equal(segment.properties.secondChange, 1);
                    assert(!segment.properties.splitOnly);

                    assert.equal(splitSegment.segmentGroups.size, 2);
                    assert.equal(splitSegment.properties.propertySource, "local");
                    assert.equal(splitSegment.properties.secondChange, 1);
                    assert.equal(splitSegment.properties.splitOnly, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props: secondChangeProps,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert.equal(segment.segmentGroups.size, 0);
                    assert.equal(segment.properties.propertySource, "local");
                    assert.equal(segment.properties.secondChange, 1);
                    assert(!segment.properties.splitOnly);

                    assert.equal(splitSegment.segmentGroups.size, 1);
                    assert.equal(splitSegment.properties.propertySource, "local");
                    assert.equal(splitSegment.properties.secondChange, 1);
                    assert.equal(splitSegment.properties.splitOnly, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: splitPos,
                                pos2: annotateEnd,
                                props: splitOnlyProps,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert.equal(segment.segmentGroups.size, 0);
                    assert.equal(segment.properties.propertySource, "local");
                    assert.equal(segment.properties.secondChange, 1);
                    assert(!segment.properties.splitOnly);

                    assert.equal(splitSegment.segmentGroups.size, 0);
                    assert.equal(splitSegment.properties.propertySource, "local");
                    assert.equal(splitSegment.properties.secondChange, 1);
                    assert.equal(splitSegment.properties.splitOnly, 1);
                });

                it("unsequenced local before remote", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "remote",
                            remoteProperty: 1,
                        },
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert.equal(segment.segmentGroups.size, 1);
                    assert.equal(segment.properties.propertySource, "local");
                    assert.equal(segment.properties.remoteProperty, 1);
                });

                it("sequenced local", () => {
                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;
                    assert.equal(segment.segmentGroups.size, 0);
                    assert.equal(segment.properties.propertySource, "local");
                });

                it("sequenced local before remote", () => {
                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "remote",
                            remoteProperty: 1,
                        },
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert.equal(segment.segmentGroups.size, 0);
                    assert.equal(segment.properties.propertySource, "remote");
                    assert.equal(segment.properties.remoteProperty, 1);
                });

                it("three local changes", () => {
                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert.equal(segment.properties.propertySource, "local");

                    const props2 = {
                        propertySource: "local2",
                        secondSource: 1,
                    };
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        props2,
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    assert.equal(segment.properties.propertySource, "local2");
                    assert.equal(segment.properties.secondSource, 1);

                    const props3 = {
                        thirdSource: 1,
                    };
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        props3,
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    assert.equal(segment.properties.propertySource, "local2");
                    assert.equal(segment.properties.secondSource, 1);
                    assert.equal(segment.properties.thirdSource, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert.equal(segment.properties.propertySource, "local2");
                    assert.equal(segment.properties.secondSource, 1);
                    assert.equal(segment.properties.thirdSource, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props: props2,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert.equal(segment.properties.propertySource, "local2");
                    assert.equal(segment.properties.secondSource, 1);
                    assert.equal(segment.properties.thirdSource, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props: props3,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert.equal(segment.properties.propertySource, "local2");
                    assert.equal(segment.properties.secondSource, 1);
                    assert.equal(segment.properties.thirdSource, 1);
                });

                it("two local changes with interleved remote", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            secondSource: "local2",
                        },
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "remote",
                            remoteOnly: 1,
                            secondSource: "remote",
                        },
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert.equal(segment.properties.remoteOnly, 1);
                    assert.equal(segment.properties.propertySource, "remote");
                    assert.equal(segment.properties.secondSource, "local2");
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
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    assert(segmentInfo.segment.segmentGroups.empty);
                });
                it("remote only", () => {
                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;
                    assert.equal(segment.properties.propertySource, "remote");
                    assert.equal(segment.properties.remoteProperty, 1);
                });

                it("split remote", () => {
                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    const splitSegment = segment.splitAt(1) as BaseSegment;
                    assert.equal(splitSegment.properties.propertySource, "remote");
                    assert.equal(splitSegment.properties.remoteProperty, 1);
                });

                it("remote before unsequenced local", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "local",
                        },
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;
                    assert.equal(segment.properties.propertySource, "local");
                    assert.equal(segment.properties.remoteProperty, 1);
                });

                it("remote before sequenced local", () => {
                    const props = {
                        propertySource: "local",
                    };

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    assert(segmentInfo.segment.segmentGroups.empty);

                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        props,
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    assert.equal(segmentInfo.segment.segmentGroups.size, 1);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    assert(segmentInfo.segment.segmentGroups.empty);
                    assert.equal(segmentInfo.segment.properties.propertySource, "local");
                    assert.equal(segmentInfo.segment.properties.remoteProperty, 1);
                });
            });
            describe("local with rewrite first", () => {
                const props = {
                    propertySource: "local",
                };
                const combiningOp: ICombiningOp = {
                    name: "rewrite",
                };
                beforeEach(() => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        props,
                        combiningOp,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);
                });

                it("unsequenced local after unsequenced local", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "local2",
                            secondProperty: "local",
                        },
                        undefined,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;
                    assert.equal(segment.properties.propertySource, "local2");
                    assert.equal(segment.properties.secondProperty, "local");
                });

                it("unsequenced local before remote", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "remote",
                            remoteProperty: 1,
                        },
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert.equal(segment.segmentGroups.size, 1);
                    assert.equal(segment.properties.propertySource, "local");
                    assert(!segment.properties.remoteProperty);
                });

                it("sequenced local before remote", () => {
                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                combiningOp,
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "remote",
                            remoteProperty: 1,
                        },
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert.equal(segment.segmentGroups.size, 0);
                    assert.equal(segment.properties.propertySource, "remote");
                    assert.equal(segment.properties.remoteProperty, 1);
                });

                it("two local changes with interleved remote", () => {
                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            secondSource: "local2",
                        },
                        combiningOp,
                        currentSequenceNumber,
                        localClientId,
                        UnassignedSequenceNumber,
                        undefined);

                    mergeTree.ackPendingSegment(
                        {
                            op: {
                                combiningOp,
                                pos1: annotateStart,
                                pos2: annotateEnd,
                                props,
                                type: MergeTreeDeltaType.ANNOTATE,
                            },
                            sequencedMessage: {
                                sequenceNumber: ++currentSequenceNumber,
                            } as ISequencedDocumentMessage,
                        });

                    mergeTree.annotateRange(
                        annotateStart,
                        annotateEnd,
                        {
                            propertySource: "remote",
                            remoteOnly: 1,
                            secondSource: "remote",
                        },
                        undefined,
                        currentSequenceNumber,
                        remoteClientId,
                        ++currentSequenceNumber,
                        undefined);

                    const segmentInfo =
                        mergeTree.getContainingSegment(annotateStart, currentSequenceNumber, localClientId);
                    const segment = segmentInfo.segment as BaseSegment;

                    assert(!segment.properties.remoteOnly);
                    assert(!segment.properties.propertySource);
                    assert.equal(segment.properties.secondSource, "local2");
                });
            });
        });
    });
});
