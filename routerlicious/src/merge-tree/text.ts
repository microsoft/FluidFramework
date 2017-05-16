// tslint:disable

import * as random from "random-js";
import * as MergeTree from "./mergeTree";
import * as fs from "fs";

export function loadTextFromFile(filename: string, mergeTree: MergeTree.MergeTree, segLimit = 0) {
    let content = fs.readFileSync(filename, "utf8");
    return loadText(content, mergeTree, segLimit);
}

export function loadSegments(content: string, segLimit: number) {
    content = content.replace(/^\uFEFF/, "");

    let paragraphs = content.split('\r\n\r\n');
    for (let i = 0, len = paragraphs.length; i < len; i++) {
        paragraphs[i] = paragraphs[i].replace(/\r\n/g, ' ').replace(/\u201c|\u201d/g, '"').replace(/\u2019/g, "'") + '\n';
    }
    let segments = <MergeTree.Segment[]>[];
    for (let paragraph of paragraphs) {
        let segment = new MergeTree.TextSegment(paragraph,
            MergeTree.UniversalSequenceNumber,
            MergeTree.LocalClientId);
        
        segments.push(segment);
    }
    if (segLimit>0) {
        segments.length = segLimit;
    }

    return segments;
}

export function loadText(content: string, mergeTree: MergeTree.MergeTree, segLimit: number) {
    const segments = loadSegments(content, segLimit);
    mergeTree.reloadFromSegments(segments);
    // for (let segment of segments) {
    //     segTree.insertInterval(segTree.getLength(0,SegTree.LocalClientId),0,SegTree.LocalClientId,0,segment);
    // }
    console.log(`Number of Segments: ${segments.length}`);
    console.log(`Height: ${mergeTree.getStats().maxHeight}`);
    //console.log(segTree.toString());
    return mergeTree;
}

let mt = random.engines.mt19937();
mt.seedWithArray([0xdeadbeef, 0xfeedbed]);

export function findRandomWord(mergeTree: MergeTree.MergeTree, clientId: number) {
    let len = mergeTree.getLength(MergeTree.UniversalSequenceNumber, clientId);
    let pos = random.integer(0, len)(mt); 
    // let textAtPos = mergeTree.getText(MergeTree.UniversalSequenceNumber, clientId, pos, pos + 10);
    // console.log(textAtPos);
    let nextWord = mergeTree.searchFromPos(pos, /\s\w+\b/);
    if (nextWord) {
        nextWord.pos += pos;
        // console.log(`next word is '${nextWord.text}' len ${nextWord.text.length} at pos ${nextWord.pos}`);
    }
    return nextWord;
}

