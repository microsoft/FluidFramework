import * as fs from "fs";
import { IMergeTreeDeltaOpArgs, Marker, MergeTree, TextSegment} from "..";
import * as ops from "../ops";
import * as Properties from "../properties";
import { loadText } from "../text";

export function loadTextFromFile(filename: string, mergeTree: MergeTree, segLimit = 0) {
    // tslint:disable-next-line:non-literal-fs-path
    const content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit);
}

export function loadTextFromFileWithMarkers(filename: string, mergeTree: MergeTree, segLimit = 0) {
    // tslint:disable-next-line:non-literal-fs-path
    const content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit, true);
}

export function insertMarker(
    mergeTree: MergeTree,
    pos: number,
    refSeq: number,
    clientId: number,
    seq: number,
    behaviors: ops.ReferenceType, props: Properties.PropertySet, opArgs: IMergeTreeDeltaOpArgs,
) {
    mergeTree.insertSegments(pos, [Marker.make(behaviors, props, seq, clientId)], refSeq, clientId, seq, opArgs);
}

export function insertText(
    mergeTree: MergeTree,
    pos: number,
    refSeq: number,
    clientId: number,
    seq: number,
    text: string,
    props: Properties.PropertySet,
    opArgs: IMergeTreeDeltaOpArgs,
) {
    mergeTree.insertSegments(pos, [TextSegment.make(text, props, seq, clientId)], refSeq, clientId, seq, opArgs);
}
