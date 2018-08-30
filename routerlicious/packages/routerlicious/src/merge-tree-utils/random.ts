import * as random from "random-js";
import { MergeTree as MergeTree } from "../client-api";

const mt = random.engines.mt19937();
mt.seedWithArray([0xdeadbeef, 0xfeedbed]);

export function findRandomWord(mergeTree: MergeTree.MergeTree, clientId: number) {
    const len = mergeTree.getLength(MergeTree.UniversalSequenceNumber, clientId);
    const pos = random.integer(0, len)(mt);
    // let textAtPos = mergeTree.getText(MergeTree.UniversalSequenceNumber, clientId, pos, pos + 10);
    // console.log(textAtPos);
    const nextWord = mergeTree.searchFromPos(pos, /\s\w+\b/);
    if (nextWord) {
        nextWord.pos += pos;
        // console.log(`next word is '${nextWord.text}' len ${nextWord.text.length} at pos ${nextWord.pos}`);
    }
    return nextWord;
}
