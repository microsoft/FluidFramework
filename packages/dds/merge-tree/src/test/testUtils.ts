/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";
import {
    IMergeBlock,
    ISegment,
    Marker,
} from "../mergeTreeNodes";
import { IMergeTreeDeltaOpArgs } from "../mergeTreeDeltaCallback";
import { TextSegment } from "../textSegment";
import { ReferenceType } from "../ops";
import { PropertySet } from "../properties";
import { MergeTree } from "../mergeTree";
import { loadText } from "./text";

export function loadTextFromFile(filename: string, mergeTree: MergeTree, segLimit = 0) {
    const content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit);
}

export function loadTextFromFileWithMarkers(filename: string, mergeTree: MergeTree, segLimit = 0) {
    const content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit, true);
}

interface InsertMarkerArgs {
    mergeTree: MergeTree;
    pos: number;
    refSeq: number;
    clientId: number;
    seq: number;
    behaviors: ReferenceType;
    props: PropertySet | undefined;
    opArgs: IMergeTreeDeltaOpArgs;
}

export function insertMarker({
    mergeTree,
    pos,
    refSeq,
    clientId,
    seq,
    behaviors,
    props,
    opArgs,
}: InsertMarkerArgs) {
    mergeTree.insertSegments(pos, [Marker.make(behaviors, props)], refSeq, clientId, seq, opArgs);
}

interface InsertTextArgs {
    mergeTree: MergeTree;
    pos: number;
    refSeq: number;
    clientId: number;
    seq: number;
    text: string;
    props?: PropertySet;
    opArgs?: IMergeTreeDeltaOpArgs;
}

export function insertText({
    mergeTree,
    pos,
    refSeq,
    clientId,
    seq,
    text,
    props,
    opArgs,
}: InsertTextArgs) {
    mergeTree.insertSegments(pos, [TextSegment.make(text, props)], refSeq, clientId, seq, opArgs);
}

interface InsertSegmentsArgs {
    mergeTree: MergeTree;
    pos: number;
    segments: ISegment[];
    refSeq: number;
    clientId: number;
    seq: number;
    opArgs: IMergeTreeDeltaOpArgs | undefined;
}

export function insertSegments({
    mergeTree,
    pos,
    segments,
    refSeq,
    clientId,
    seq,
    opArgs,
}: InsertSegmentsArgs): void {
    mergeTree.insertSegments(pos, segments, refSeq, clientId, seq, opArgs);
}

interface MarkRangeRemovedArgs {
    mergeTree: MergeTree;
    start: number;
    end: number;
    refSeq: number;
    clientId: number;
    seq: number;
    overwrite: boolean;
    opArgs: IMergeTreeDeltaOpArgs;
}

export function markRangeRemoved({
    mergeTree,
    start,
    end,
    refSeq,
    clientId,
    seq,
    overwrite = false,
    opArgs,
}: MarkRangeRemovedArgs): void {
    mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq, overwrite, opArgs);
}

export function nodeOrdinalsHaveIntegrity(block: IMergeBlock): boolean {
    const olen = block.ordinal.length;
    for (let i = 0; i < block.childCount; i++) {
        if (block.children[i].ordinal) {
            if (olen !== (block.children[i].ordinal.length - 1)) {
                console.log("node integrity issue");
                return false;
            }
            if (i > 0) {
                if (block.children[i].ordinal <= block.children[i - 1].ordinal) {
                    console.log("node sib integrity issue");
                    return false;
                }
            }
            if (!block.children[i].isLeaf()) {
                return nodeOrdinalsHaveIntegrity(block.children[i] as IMergeBlock);
            }
        } else {
            console.log(`node child ordinal not set ${i}`);
            return false;
        }
    }
    return true;
}

/**
 * Returns an object that tallies each delta and maintenance operation observed
 * for the given 'mergeTree'.
 */
export function countOperations(mergeTree: MergeTree) {
    const counts = {};

    assert.strictEqual(mergeTree.mergeTreeDeltaCallback, undefined);
    assert.strictEqual(mergeTree.mergeTreeMaintenanceCallback, undefined);

    const fn = (deltaArgs) => {
        const previous = counts[deltaArgs.operation] as undefined | number;
        counts[deltaArgs.operation] = (previous === undefined
            ? 1
            : previous + 1);
    };

    mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs) => { fn(deltaArgs); };
    mergeTree.mergeTreeMaintenanceCallback = fn;

    return counts;
}
