/// <reference path="node.d.ts" />
/// <reference path="base.d.ts" />
/// <reference path="random.d.ts" />

import * as random from "random-js";
import * as SegTree from "./segmentTree";
import * as fs from "fs";

export function loadText(filename: string, segTree: SegTree.SegmentTree, segLimit = 0) {
    let content = fs.readFileSync(filename, "utf8");
    content = content.replace(/^\uFEFF/, "");

    let paragraphs = content.split('\r\n\r\n');
    for (let i = 0, len = paragraphs.length; i < len; i++) {
        paragraphs[i] = paragraphs[i].replace(/\r\n/g, ' ').replace(/\u201c|\u201d/g, '"').replace(/\u2019/g, "'") + '\n';
    }
    let segments = <SegTree.TextSegment[]>[];
    for (let paragraph of paragraphs) {
        let segment = <SegTree.TextSegment>{
            text: paragraph,
            seq: SegTree.UniversalSequenceNumber,
            clientId: SegTree.LocalClientId
        }
        segments.push(segment);
    }
    if (segLimit>0) {
        segments.length = segLimit;
    }
    segTree.reloadFromSegments(segments);
    // for (let segment of segments) {
    //     segTree.insertInterval(segTree.getLength(0,SegTree.LocalClientId),0,SegTree.LocalClientId,0,segment);
    // }
    console.log(`Number of Segments: ${segments.length}`);
    console.log(`Height: ${segTree.getStats().maxHeight}`);
    //console.log(segTree.toString());
    return segTree;
}

let mt = random.engines.mt19937();
mt.seedWithArray([0xdeadbeef, 0xfeedbed]);

export function findRandomWord(segTree: SegTree.SegmentTree, clientId: number) {
    let len = segTree.getLength(SegTree.UniversalSequenceNumber, clientId);
    let pos = random.integer(0, len)(mt);
    let textAtPos = segTree.getText(SegTree.UniversalSequenceNumber, clientId, pos, pos + 10);
    //console.log(textAtPos);
    let nextWord = segTree.searchFromPos(pos, /\s\w+\b/);
    if (nextWord) {
        nextWord.pos += pos;
//        console.log(`next word is '${nextWord.text}' len ${nextWord.text.length} at pos ${nextWord.pos}`);
    }
    return nextWord;
}

