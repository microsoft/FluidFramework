// tslint:disable

import * as api from "../api";
import * as mergeTree from "../merge-tree";
import {IIntelligentService} from "../intelligence"

class Speller {
    static maxWord = 256;
    constructor(public sharedString: mergeTree.SharedString) {
    }

    spellingError(candidate: string) {
        return (candidate.length > 4) && (candidate.length < 8) && candidate.startsWith("B");
    }

    setEvents(intelligence: IIntelligentService) {
        this.sharedString.on("op", (msg: api.ISequencedMessage) => {
            if (msg && msg.op) {
                let delta = <api.IMergeTreeOp>msg.op;
                if (delta.type === api.MergeTreeDeltaType.INSERT) {
                    this.currentWordSpellCheck(intelligence, delta.pos1);
                } else if (delta.type === api.MergeTreeDeltaType.REMOVE) {
                    let pos= delta.pos1;
                    if (pos>0) {
                        // ensure pos within word
                        pos--;
                    }
                    this.currentWordSpellCheck(intelligence, pos);
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
                if (this.spellingError(candidate)) {
                    let start = result.index;
                    let end = re.lastIndex;
                    let textErrorInfo = { text: text.substring(start, end), alternates: ["giraffe", "bunny"] };
                    console.log(`spell (${start}, ${end}): ${textErrorInfo.text}`);
                    this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                }
            }
        } while (result);
        this.setEvents(intelligence);
    }

    currentWordSpellCheck(intelligence: IIntelligentService, pos: number) {
        let startPos = pos - Speller.maxWord;
        let endPos = pos + Speller.maxWord;

        if (startPos < 0) {
            startPos = 0;
        }
        let text = this.sharedString.client.getTextRangeWithPlaceholders(startPos, endPos);
        let re = /\b\w+\b/g;
        let result: RegExpExecArray;

        do {
            result = re.exec(text);
            if (result) {
                let start = result.index + startPos;
                let end = re.lastIndex + startPos;
                if ((start <= pos) && (end > pos)) {
                    let candidate = result[0];
                    if (this.spellingError(candidate)) {
                        let textErrorInfo = {
                            text: text.substring(result.index, re.lastIndex),
                            alternates: ["giraffe", "bunny"]
                        };
                        console.log(`respell (${start}, ${end}): ${textErrorInfo.text}`);
                        this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                    }
                    else {
                        console.log(`spell ok (${start}, ${end}): ${text.substring(result.index, re.lastIndex)}`);
                        this.sharedString.annotateRange({ textError: null }, start, end);
                    }
                }
            }
        }
        while ((re.lastIndex <= pos) && result);
    }
}


export class Spellcheker {

    constructor(private root: mergeTree.SharedString, private intelligence: IIntelligentService) {
    }

    public run() {
        this.root.on("partialLoad", (data) => {
            console.log("partial load fired");
        });
        this.root.on("loadFinshed", (data: api.MergeTreeChunk, existing: boolean) => {
            const theSpeller = new Speller(this.root);
            theSpeller.initialSpellCheck(this.intelligence);
        });
    }
}
