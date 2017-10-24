// tslint:disable

import * as queue from "async/queue";
import clone = require("lodash/clone");
import { core, mergeTree } from "../client-api";
import { IIntelligentService } from "../intelligence";

interface ISpellQuery {
    // Request text to spellcheck.
    text: string;

    // Reference sequence number.
    rsn: number;

    // Start position.
    start: number;

    // End position
    end: number;
};

interface IPgMarker {

    tile: mergeTree.Marker;

    pos: number;
}

function compareProxStrings(a: mergeTree.Collections.ProxString<number>, b: mergeTree.Collections.ProxString<number>) {
    let ascore = ((a.invDistance * 200) * a.val) + a.val;
    let bscore = ((b.invDistance * 200) * b.val) + b.val;
    return bscore - ascore;
}

interface IWordCheckSpec {
    pos: number;
    rev?: boolean;
}

class Speller {
    static altMax = 7;
    static spellerParagraphs = 10000;
    static idleTimeMS = 500;
    currentIdleTime : number = 0;
    pendingSpellChecks: mergeTree.IMergeTreeOp[] = [];
    pendingParagraphs: Array<IPgMarker> =  new Array<IPgMarker>();
    offsetMap: { [start: number]: number} = {};
    verbose = false;
    serviceCounter: number = 0;
    initialQueue: any;
    typingQueue: any;
    pendingCheckInfo: IWordCheckSpec;
    pendingWordCheckTimer: any;

    constructor(public sharedString: mergeTree.SharedString, private dict: mergeTree.Collections.TST<number>,
        private intelligence: IIntelligentService) {
        this.initializeSpellerQueue();
    }

    initializeSpellerQueue() {
        this.initialQueue = queue((task: ISpellQuery, callback) => {
            const resultP = this.intelligence.run(task);
            resultP.then((result) => {
                const spellErrors = this.checkSpelling(task.rsn, task.text, task.start, result);
                if (spellErrors.annotations.length > 0) {
                    for (const annotation of spellErrors.annotations) {
                        this.sharedString.annotateRangeFromPast({ textError: annotation.textError }, annotation.globalStartOffset, annotation.globalEndOffset, spellErrors.rsn);
                        this.sharedString.setLocalMinSeq(spellErrors.rsn);
                    }
                }
                callback();
            }, (error) => {
                callback();
            });
        }, 1);
        this.typingQueue = queue((task: ISpellQuery, callback) => {
            callback();
        }, 1);
    }
    spellingError(word: string) {
        if (/\b\d+\b/.test(word)) {
            return false;
        }
        else {
            return !this.dict.contains(word);
        }
    }

    checkPending(intelligence: IIntelligentService) {
        this.currentWordSpellCheck(intelligence, this.pendingCheckInfo.pos, this.pendingCheckInfo.rev);
    }
    // TODO: use delayed spell check on each modified paragraph 
    spellOp(delta: mergeTree.IMergeTreeOp, intelligence: IIntelligentService) {
        // let setPending = () => {
        //     if (this.pendingWordCheckTimer) {
        //         clearTimeout(this.pendingWordCheckTimer);
        //     }
        //     this.pendingWordCheckTimer = setTimeout(() => {
        //         this.checkPending(intelligence);
        //     }, 300);
        // }
        if (delta.type === mergeTree.MergeTreeDeltaType.INSERT) {
//            this.pendingCheckInfo = { pos: delta.pos1 };
//            setPending();
            this.currentWordSpellCheck(intelligence, delta.pos1);
        } else if (delta.type === mergeTree.MergeTreeDeltaType.REMOVE) {
//            this.pendingCheckInfo = { pos: delta.pos1, rev: true };
//            setPending();
            this.currentWordSpellCheck(intelligence, delta.pos1, true);
        }
        else if (delta.type === mergeTree.MergeTreeDeltaType.GROUP) {
            for (let groupOp of delta.ops) {
                this.spellOp(groupOp, intelligence);
            }
        }
    }

    enqueueParagraph(delta: mergeTree.IMergeTreeOp) {
        if (delta.type === mergeTree.MergeTreeDeltaType.INSERT ||
            delta.type === mergeTree.MergeTreeDeltaType.REMOVE) {
            let pgMarker = this.sharedString.client.mergeTree.findTile(delta.pos1,
                this.sharedString.client.getClientId(), "pg");
            if (!pgMarker) {
                pgMarker = { tile: undefined, pos: 0};
            }
            this.pendingParagraphs.push(pgMarker);
        } else if (delta.type === mergeTree.MergeTreeDeltaType.GROUP) {
            for (let groupOp of delta.ops) {
                this.enqueueParagraph(groupOp);
            }
        }
    }

    setEvents(intelligence: IIntelligentService) {
        const idleCheckerMS = Speller.idleTimeMS / 5;
        setInterval(() => {
            this.currentIdleTime += idleCheckerMS;
            if (this.currentIdleTime >= Speller.idleTimeMS) {
                this.runSpellOp(intelligence);
                this.currentIdleTime = 0;
            }
        }, idleCheckerMS);
        this.sharedString.on("op", (msg: core.ISequencedObjectMessage) => {
            if (msg && msg.contents) {
                let delta =  <mergeTree.IMergeTreeOp>msg.contents;
                this.pendingSpellChecks.push(delta);
                this.enqueueParagraph(delta);
                this.currentIdleTime = 0;
            }
        });
    }

    runSpellOp(intelligence: IIntelligentService) {
        if (this.pendingSpellChecks.length > 0) {
            const pendingChecks = clone(this.pendingSpellChecks);
            this.pendingSpellChecks = [];
            for (let delta of pendingChecks) {
                this.spellOp(delta, intelligence);
            }
        }
        if (this.pendingParagraphs.length > 0) {
            for (let pg of this.pendingParagraphs) {
                let offset = 0;
                if (pg.tile) {
                    offset = this.sharedString.client.mergeTree.getOffset(pg.tile, mergeTree.UniversalSequenceNumber,
                    this.sharedString.client.getClientId());
                }
                const endMarkerPos = this.sharedString.client.mergeTree.findTile(offset,
                    this.sharedString.client.getClientId(), "pg", false);
                let endPos: number;
                if (endMarkerPos) {
                    endPos = endMarkerPos.pos;
                } else {
                    endPos = this.sharedString.client.mergeTree.getLength(mergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId())
                }
                this.offsetMap[offset] = endPos;
            }
            console.log(`Paragraph markers...`);
            for (let start of Object.keys(this.offsetMap)) {
                const queryString = this.sharedString.client.mergeTree.getText(mergeTree.UniversalSequenceNumber,
                    this.sharedString.client.getClientId(), false, Number(start), this.offsetMap[start]);
                this.enqueNewQuery(intelligence, queryString, Number(start));
            }
            this.offsetMap = {};
            this.pendingParagraphs = [];
        }
    }

    initialSpellCheck() {
        let spellParagraph = (startPG: number, endPG: number, text: string) => {
            let re = /\b\w+\b/g;
            let result: RegExpExecArray;
            this.initSpellerService(this.intelligence, text, startPG);
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
                        if (marker.hasTileLabel("pg")) {
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

        this.setEvents(this.intelligence);
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
                    if (marker.hasTileLabel("pg")) {
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
                    if (marker.hasTileLabel("pg")) {
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
                        this.sharedString.annotateRange({ textError: null }, start, end);
                    }
                }
            }
            while (result);
        }
    }

    initSpellerService(intelligence: IIntelligentService, queryString: string, startPos: number) {
        if (this.serviceCounter < Speller.spellerParagraphs) {
            if (queryString.length > 0) {
                this.initialQueue.push({ text: queryString, rsn: this.sharedString.referenceSequenceNumber, start: startPos, end: startPos + queryString.length });
                ++this.serviceCounter;
            }
        }
    }

    enqueNewQuery(intelligence: IIntelligentService, queryString: string, startPos: number) {
        if (queryString.length > 0) {
            this.typingQueue.push({ text: queryString, rsn: this.sharedString.referenceSequenceNumber, start: startPos, end: startPos + queryString.length });
        }
    }

    checkSpelling(rsn: number, original: string, startPos: number, result: any) {
        let endPos = startPos + original.length;
        let annotationRanges = [];

        // No critiques from spellchecker service. Clear the whole paragraph.
        if (result.spellcheckerResult.answer === null) {
            annotationRanges.push({ textError: null, globalStartOffset: startPos, globalEndOffset: endPos });
            return { rsn, annotations: annotationRanges };
        }
        const answer = result.spellcheckerResult.answer;
        if (answer.Critiques.length === 0) {
            annotationRanges.push({ textError: null, globalStartOffset: startPos, globalEndOffset: endPos });
            return { rsn, annotations: annotationRanges };
        }

        // Go through each critique and create annotation ranges.
        let runningStart = startPos;
        const critiques = answer.Critiques;
        for (let critique of critiques) {
            let localStartOffset = critique.Start;
            let localEndOffset = localStartOffset + critique.Length;
            let origWord = original.substring(localStartOffset, localEndOffset);
            const globalStartOffset = startPos + localStartOffset;
            const globalEndOffset = startPos + localEndOffset;
            let altSpellings = [];

            // Correctly spelled range. Send null and update runningStart.
            if (runningStart < globalStartOffset) {
                annotationRanges.push({ textError: null, globalStartOffset: runningStart, globalEndOffset: globalStartOffset });
            }
            runningStart = globalEndOffset;

            // Spelling error but no suggestions found. Continue to next critique.
            if (critique.Suggestions.length === 0 || critique.Suggestions[0].Text === "No suggestions") {
                if (critique.CategoryTitle === "Grammar") {
                    annotationRanges.push({ textError: { text: origWord, alternates: altSpellings, color: "paulgreen", explanation: null }, globalStartOffset, globalEndOffset });
                } else if (critique.CategoryTitle === "Spelling") {
                    annotationRanges.push({ textError: { text: origWord, alternates: altSpellings, color: "paul", explanation: null }, globalStartOffset, globalEndOffset });
                } else {
                    annotationRanges.push({ textError: { text: origWord, alternates: altSpellings, color: "paulgolden", explanation: null }, globalStartOffset, globalEndOffset });
                }
                continue;
            }
            // Suggestions found. Create annotation ranges.
            for (let i = 0; i < Math.min(Speller.altMax, critique.Suggestions.length); ++i) {
                altSpellings.push({ text: critique.Suggestions[i].Text, invDistance: i, val: i });
            }
            if (critique.CategoryTitle === "Grammar") {
                annotationRanges.push({ textError: { text: origWord, alternates: altSpellings, color: "paulgreen", explanation: critique.Explanation }, globalStartOffset, globalEndOffset });
            } else if (critique.CategoryTitle === "Spelling") {
                annotationRanges.push({ textError: { text: origWord, alternates: altSpellings, color: "paul", explanation: null }, globalStartOffset, globalEndOffset });
            } else {
                annotationRanges.push({ textError: { text: origWord, alternates: altSpellings, color: "paulgolden", explanation: critique.Explanation }, globalStartOffset, globalEndOffset });
            }
        }
        // No more critiques. Send null for rest of the text.
        if (runningStart < endPos) {
            annotationRanges.push({ textError: null, globalStartOffset: runningStart, globalEndOffset: endPos });
        }
        return { rsn, annotations: annotationRanges };
    }
}

export class Spellcheker {
    constructor(
        private root: mergeTree.SharedString,
        private dict: mergeTree.Collections.TST<number>,
        private intelligence: IIntelligentService) {
    }

    public run() {
        this.root.loaded.then(() => {
            const theSpeller = new Speller(this.root, this.dict, this.intelligence);
            theSpeller.initialSpellCheck();
        });
    }
}
