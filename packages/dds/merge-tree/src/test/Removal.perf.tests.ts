/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { MergeTree } from '../mergeTree';
import { MergeTreeDeltaType } from '../ops';
import { insertText, markRangeRemoved } from './testUtils';

function constructTree(numOfSegments: number): MergeTree {
    const mergeTree = new MergeTree();

    for (let i = 0; i < numOfSegments; i++) {
        insertText({
            mergeTree,
            pos: 0,
            refSeq: i,
            clientId: 0,
            seq: i,
            text: "a",
            props: undefined,
            opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
        });
    }

    return mergeTree;
}

describe('removal perf', () => {
    const largeRangeTree = constructTree(1000);

    benchmark({
        type: BenchmarkType.Measurement,
        title: 'remove large range of large tree',
        benchmarkFn: () => {
            markRangeRemoved({
                mergeTree: largeRangeTree,
                start: 0,
                end: 1000,
                refSeq: 1000,
                clientId: 0,
                seq: 1000,
                opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
                overwrite: false,
            });
        },
    });

    const startTree = constructTree(1000);

    benchmark({
        type: BenchmarkType.Measurement,
        title: 'remove start of large tree',
        benchmarkFn: () => {
            markRangeRemoved({
                mergeTree: startTree,
                start: 0,
                end: 1,
                refSeq: 1000,
                clientId: 0,
                seq: 1000,
                opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
                overwrite: false,
            });
        },
    });

    const middleTree = constructTree(1000);

    benchmark({
        type: BenchmarkType.Measurement,
        title: 'remove middle of large tree',
        benchmarkFn: () => {
            markRangeRemoved({
                mergeTree: middleTree,
                start: 499,
                end: 501,
                refSeq: 1000,
                clientId: 0,
                seq: 1000,
                opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
                overwrite: false,
            });
        },
    });

    const endTree = constructTree(1000);

    benchmark({
        type: BenchmarkType.Measurement,
        title: 'remove end of large tree',
        benchmarkFn: () => {
            markRangeRemoved({
                mergeTree: endTree,
                start: 999,
                end: 1000,
                refSeq: 1000,
                clientId: 0,
                seq: 1000,
                opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
                overwrite: false,
            });
        },
    });
});
