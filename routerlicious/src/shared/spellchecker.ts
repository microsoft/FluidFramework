// tslint:disable

import * as api from "../api";
import * as mergeTree from "../merge-tree";
import * as Collections from "../merge-tree/collections";
import {IIntelligentService} from "../intelligence";


function compareProxStrings(a: Collections.ProxString<number>, b: Collections.ProxString<number>) {
    let ascore = ((a.invDistance * 200) * a.val) + a.val;
    let bscore = ((b.invDistance * 200) * b.val) + b.val;
    return bscore - ascore;
}

class Speller {
    static maxWord = 256;
    constructor(public sharedString: mergeTree.SharedString, private dict: Collections.TST<number>) {
    }

    spellingError(word: string) {
        if (/\b\d+\b/.test(word)) {
            return false;
        }
        else {
            return !this.dict.contains(word);
        }
    }

    setEvents(intelligence: IIntelligentService) {
        this.sharedString.on("op", (msg: api.ISequencedMessage) => {
            if (msg && msg.op) {
                let delta = <api.IMergeTreeOp>msg.op;
                if (delta.type === api.MergeTreeDeltaType.INSERT) {
                    this.currentWordSpellCheck(intelligence, delta.pos1);
                } else if (delta.type === api.MergeTreeDeltaType.REMOVE) {
                    this.currentWordSpellCheck(intelligence, delta.pos1, true);
                }
            }
        });
    }

    initialSpellCheck(intelligence: IIntelligentService) {
        let text = this.sharedString.client.getTextWithPlaceholders();
        let re = /\b\w+\b/g;
        let result: RegExpExecArray;
        do {
            result = re.exec(text);
            if (result) {
                let candidate = result[0];
                if (this.spellingError(candidate.toLocaleLowerCase())) {
                    let start = result.index;
                    let end = re.lastIndex;
                    let textErrorInfo = this.makeTextErrorInfo(candidate);
                    // console.log(`spell (${start}, ${end}): ${textErrorInfo.text}`);
                    this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                }
            }
        } while (result);
        this.setEvents(intelligence);
    }

    makeTextErrorInfo(candidate: string) {
        let alternates = this.dict.neighbors(candidate, 2).sort(compareProxStrings);
        if (alternates.length > 7) {
            alternates.length = 7;
        }
        return {
            text: candidate,
            alternates: alternates
        };
    }

    currentWordSpellCheck(intelligence: IIntelligentService, pos: number, rev = false) {
        let text = "";
        let fwdText = "";
        let gatherReverse = (segment: mergeTree.Segment) => {
            switch (segment.getType()) {
                case mergeTree.SegmentType.Marker:
                    text = " " + text;
                    break;
                case mergeTree.SegmentType.Text:
                    let textSegment = <mergeTree.TextSegment>segment;
                    if (textSegment.netLength()) {
                        // not removed
                        text = textSegment.text + text;
                    }
                    break;
                // TODO: component
            }
            // console.log(`rev: -${text}-`);
            if (/\s+\w+/.test(text)) {
                return false;
            }
            else {
                return true;
            }
        };

        let gatherForward = (segment: mergeTree.Segment) => {
            switch (segment.getType()) {
                case mergeTree.SegmentType.Marker:
                    fwdText = fwdText + " ";
                    break;
                case mergeTree.SegmentType.Text:
                    let textSegment = <mergeTree.TextSegment>segment;
                    if (textSegment.netLength()) {
                        // not removed
                        fwdText = fwdText + textSegment.text;
                    }
                    break;
                // TODO: component
            }
            // console.log(`fwd: -${fwdText}-`);
            if (/\w+\s+/.test(fwdText)) {
                return false;
            }
            else {
                return true;
            }
        };
        let segoff = this.sharedString.client.mergeTree.getContainingSegment(pos,
            mergeTree.UniversalSequenceNumber, this.sharedString.client.getClientId());
        if (segoff.offset !== 0) {
            // console.log("expected pos only at segment boundary");
        }
        // assumes op has made pos a segment boundary
        this.sharedString.client.mergeTree.leftExcursion(segoff.segment, gatherReverse);
        let startPos = pos - text.length;
        if (segoff.segment) {
            if (gatherForward(segoff.segment)) {
                this.sharedString.client.mergeTree.rightExcursion(segoff.segment, gatherForward);
            }
            text = text + fwdText;
            let re = /\b\w+\b/g;
            let result: RegExpExecArray;
            do {
                result = re.exec(text);
                if (result) {
                    let start = result.index + startPos;
                    let end = re.lastIndex + startPos;
                    let candidate = result[0];
                    if (this.spellingError(candidate.toLocaleLowerCase())) {
                        let textErrorInfo = this.makeTextErrorInfo(candidate);
                        // console.log(`respell (${start}, ${end}): ${textErrorInfo.text}`);
                        // let buf = "alternates: ";
                        // for (let alt of textErrorInfo.alternates) {
                            // buf += ` ${alt.text}:${alt.invDistance}:${alt.val}`;
                        // }
                        // console.log(buf);
                        this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                    }
                    else {
                        // console.log(`spell ok (${start}, ${end}): ${text.substring(result.index, re.lastIndex)}`);
                        // this.sharedString.annotateRange({ textError: null }, start, end);
                    }
                }
            }
            while (result);
        }
    }
}


export class Spellcheker {

    constructor(private root: mergeTree.SharedString, private dict: Collections.TST<number>, private intelligence: IIntelligentService) {
    }

    public run() {
        this.root.on("partialLoad", (data) => {
            console.log("partial load fired");
        });
        this.root.on("loadFinshed", (data: api.MergeTreeChunk, existing: boolean) => {
            const theSpeller = new Speller(this.root, this.dict);
            theSpeller.initialSpellCheck(this.intelligence);
        });
    }

    public dummy() {

    }
}
