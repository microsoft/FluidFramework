import * as fs from "fs";
import { IMergeBlock, IMergeTreeDeltaOpArgs, Marker, MergeTree, TextSegment} from "..";
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
    mergeTree.insertSegments(pos, [TextSegment.Make(text, props, seq, clientId)], refSeq, clientId, seq, opArgs);
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
