/// <reference path="node.d.ts" />
/// <reference path="base.d.ts" />

import * as SegTree from "./segmentTree";
import * as fs from "fs";

export function loadText(filename: string) {
    let content = fs.readFileSync(filename, "utf8");
    content = content.replace(/^\uFEFF/,"");

    let paragraphs = content.split('\r\n\r\n');
    for (let i = 0, len = paragraphs.length; i < len; i++) {
        paragraphs[i] = paragraphs[i].replace(/\r\n/g, ' ').replace(/\u201c|\u201d/g,'"') + '\n';
    }
    let segTree = SegTree.segmentTree("");
    for (let paragraph of paragraphs) {
        let segment = <SegTree.TextSegment>{
            text: paragraph
        }
        segTree.insertInterval(segTree.getLength(0, -1), 0, -1, 0, segment);
    }
    console.log(`Height: ${segTree.getHeight()}`);
    console.log(segTree.toString());
}