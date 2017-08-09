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
    static altMax = 7;
    verbose = false;
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
        this.sharedString.on("op", (msg: api.ISequencedObjectMessage) => {
            if (msg && msg.contents) {
                let delta = <mergeTree.IMergeTreeOp>msg.contents;
                if (delta.type === mergeTree.MergeTreeDeltaType.INSERT) {
                    this.currentWordSpellCheck(intelligence, delta.pos1);
                } else if (delta.type === mergeTree.MergeTreeDeltaType.REMOVE) {
                    this.currentWordSpellCheck(intelligence, delta.pos1, true);
                }
            }
        });
    }

    initialSpellCheck(intelligence: IIntelligentService) {
        let spellParagraph = (startPG: number, endPG: number, text: string) => {
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
                        if (this.verbose) {
                            console.log(`spell (${startPG + start}, ${startPG + end}): ${textErrorInfo.text}`);
                        }
                        this.sharedString.annotateRange({ textError: textErrorInfo }, startPG + start, startPG + end);
                    }
                }
            } while (result);
        }
        let prevPG: mergeTree.Marker;
        let startPGPos = 0;
        let pgText = "";
        let endMarkerFound = false;

        function gatherPG(segment: mergeTree.Segment, segpos: number) {
            switch (segment.getType()) {
                case mergeTree.SegmentType.Marker:
                    let marker = <mergeTree.Marker>segment;
                    if (marker.netLength()) {
                        if (marker.type === "pg") {
                            if (prevPG) {
                                // TODO: send paragraph to service
                                spellParagraph(startPGPos, segpos, pgText);
                                endMarkerFound = true;
                            }
                            startPGPos = segpos + marker.netLength();
                            prevPG = marker;
                            pgText = "";
                            if (endMarkerFound) {
                                return false;
                            }
                        }
                        else {
                            for (let i = 0; i < marker.netLength(); i++) {
                                pgText += " ";
                            }
                        }
                    }
                    break;
                case mergeTree.SegmentType.Text:
                    let textSegment = <mergeTree.TextSegment>segment;
                    if (textSegment.netLength()) {
                        pgText += textSegment.text;
                    }
                    break;
            }
            return true;
        }

        do {
            endMarkerFound = false;
            this.sharedString.client.mergeTree.mapRange({ leaf: gatherPG }, mergeTree.UniversalSequenceNumber,
                this.sharedString.client.getClientId(), undefined, startPGPos);
        } while (endMarkerFound);

        if (prevPG) {
            // TODO: send paragraph to service
            spellParagraph(startPGPos, startPGPos + pgText.length, pgText);
        }
        
        this.setEvents(intelligence);
    }

    makeTextErrorInfo(candidate: string) {
        let alternates = this.dict.neighbors(candidate, 2).sort(compareProxStrings);
        if (alternates.length > Speller.altMax) {
            alternates.length = Speller.altMax;
        }
        return {
            text: candidate,
            alternates: alternates
        };
    }

    currentWordSpellCheck(intelligence: IIntelligentService, pos: number, rev = false) {
        let words = "";
        let fwdWords = "";
        let sentence = "";
        let fwdSentence = "";
        let wordsFound = false;

        let gatherReverse = (segment: mergeTree.Segment) => {
            switch (segment.getType()) {
                case mergeTree.SegmentType.Marker:
                    if (!wordsFound) {
                        words = " " + words;
                    }
                    sentence = " " + sentence;
                    let marker = <mergeTree.Marker>segment;
                    if (marker.type === "pg") {
                        return false;
                    }
                    break;
                case mergeTree.SegmentType.Text:
                    let textSegment = <mergeTree.TextSegment>segment;
                    if (textSegment.netLength()) {
                        if (!wordsFound) {
                            words = textSegment.text + words;
                        }
                        sentence = textSegment.text + sentence;
                    }
                    break;
                // TODO: component
            }
            // console.log(`rev: -${text}-`);
            if (/\s+\w+/.test(words)) {
                wordsFound = true;
            }
            if (/[\?\.\!]\s*\w+/.test(sentence)) {
                return false;
            }
            return true;
        };

        let gatherForward = (segment: mergeTree.Segment) => {
            switch (segment.getType()) {
                case mergeTree.SegmentType.Marker:
                    if (!wordsFound) {
                        fwdWords = fwdWords + " ";
                    }
                    fwdSentence = fwdSentence + " ";
                    let marker = <mergeTree.Marker>segment;
                    if (marker.type === "pg") {
                        return false;
                    }
                    break;
                case mergeTree.SegmentType.Text:
                    let textSegment = <mergeTree.TextSegment>segment;
                    if (textSegment.netLength()) {
                        if (!wordsFound) {
                            fwdWords = fwdWords + textSegment.text;
                        }
                        fwdSentence = fwdSentence + textSegment.text;
                    }
                    break;
                // TODO: component
            }
            if (/\w+\s+/.test(fwdWords)) {
                wordsFound = true;
            }
            if (/\w+\s*[\.\?\!]/.test(fwdSentence)) {
                return false;
            }
            return true;
        };

        let segoff = this.sharedString.client.mergeTree.getContainingSegment(pos,
            mergeTree.UniversalSequenceNumber, this.sharedString.client.getClientId());
        if (segoff.offset !== 0) {
            console.log("expected pos only at segment boundary");
        }
        // assumes op has made pos a segment boundary
        this.sharedString.client.mergeTree.leftExcursion(segoff.segment, gatherReverse);
        let startPos = pos - words.length;
        let sentenceStartPos = pos - sentence.length;

        if (segoff.segment) {
            wordsFound = false;
            if (gatherForward(segoff.segment)) {
                this.sharedString.client.mergeTree.rightExcursion(segoff.segment, gatherForward);
            }
            words = words + fwdWords;
            sentence = sentence + fwdSentence;
            if (this.verbose) {
                console.log(`found sentence ${sentence} (start ${sentenceStartPos}, end ${sentenceStartPos + sentence.length}) around change`);
            }
            // TODO: send this sentence to service for analysis 
            let re = /\b\w+\b/g;
            let result: RegExpExecArray;
            do {
                result = re.exec(words);
                if (result) {
                    let start = result.index + startPos;
                    let end = re.lastIndex + startPos;
                    let candidate = result[0];
                    if (this.spellingError(candidate.toLocaleLowerCase())) {
                        let textErrorInfo = this.makeTextErrorInfo(candidate);
                        if (this.verbose) {
                            console.log(`respell (${start}, ${end}): ${textErrorInfo.text}`);
                            let buf = "alternates: ";
                            for (let alt of textErrorInfo.alternates) {
                                buf += ` ${alt.text}:${alt.invDistance}:${alt.val}`;
                            }
                            console.log(buf);
                        }
                        this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                    }
                    else {
                        if (this.verbose) {
                            console.log(`spell ok (${start}, ${end}): ${words.substring(result.index, re.lastIndex)}`);
                        }
                        // this.sharedString.annotateRange({ textError: null }, start, end);
                    }
                }
            }
            while (result);
        }
    }
}

export class Spellcheker {
    constructor(
        private root: mergeTree.SharedString,
        private dict: Collections.TST<number>,
        private intelligence: IIntelligentService) {
    }

    public run() {
        this.root.loaded.then(() => {
            const theSpeller = new Speller(this.root, this.dict);
            theSpeller.initialSpellCheck(this.intelligence);
        });
    }
}
