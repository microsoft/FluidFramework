// tslint:disable:whitespace
import * as queue from "async/queue";
import clone = require("lodash/clone");
import { core, MergeTree } from "../client-api";
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

    tile: MergeTree.Marker;

    pos: number;
}

function compareProxStrings(a: MergeTree.Collections.ProxString<number>, b: MergeTree.Collections.ProxString<number>) {
    let ascore = ((a.invDistance * 200) * a.val) + a.val;
    let bscore = ((b.invDistance * 200) * b.val) + b.val;
    return bscore - ascore;
}

class Speller {
    private static altMax = 7;
    private static spellerParagraphs = 10000;
    private static idleTimeMS = 500;
    private currentIdleTime: number = 0;
    private pendingSpellChecks: MergeTree.IMergeTreeOp[] = [];
    private pendingParagraphs: IPgMarker[] = new Array<IPgMarker>();
    private offsetMap: { [start: number]: number } = {};
    private verbose = false;
    private serviceCounter: number = 0;
    private initialQueue: any;
    private typingQueue: any;

    constructor(
        public sharedString: MergeTree.SharedString,
        private dict: MergeTree.Collections.TST<number>,
        private intelligence: IIntelligentService) {
        this.initializeSpellerQueue();
    }

    public initialSpellCheck() {
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
        };
        let prevPG: MergeTree.Marker;
        let startPGPos = 0;
        let pgText = "";
        let endMarkerFound = false;
        let mergeTree = this.sharedString.client.mergeTree;
        function gatherPG(segment: MergeTree.Segment, segpos: number) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    let marker = <MergeTree.Marker>segment;
                    if (mergeTree.localNetLength(segment)) {
                        if (marker.hasTileLabel("pg")) {
                            if (prevPG) {
                                // TODO: send paragraph to service
                                spellParagraph(startPGPos, segpos, pgText);
                                endMarkerFound = true;
                            }
                            startPGPos = segpos + mergeTree.localNetLength(segment);
                            prevPG = marker;
                            pgText = "";
                            if (endMarkerFound) {
                                return false;
                            }
                        } else {
                            for (let i = 0; i < mergeTree.localNetLength(segment); i++) {
                                pgText += " ";
                            }
                        }
                    }
                    break;
                case MergeTree.SegmentType.Text:
                    let textSegment = <MergeTree.TextSegment>segment;
                    if (mergeTree.localNetLength(textSegment)) {
                        pgText += textSegment.text;
                    }
                    break;
                default:
                    throw new Error("Unknown SegmentType");
            }
            return true;
        }

        do {
            endMarkerFound = false;
            this.sharedString.client.mergeTree.mapRange({ leaf: gatherPG }, MergeTree.UniversalSequenceNumber,
                this.sharedString.client.getClientId(), undefined, startPGPos);
        } while (endMarkerFound);

        if (prevPG) {
            // TODO: send paragraph to service
            spellParagraph(startPGPos, startPGPos + pgText.length, pgText);
        }

        this.setEvents(this.intelligence);
    }

    private initializeSpellerQueue() {
        this.initialQueue = queue((task: ISpellQuery, callback) => {
            const resultP = this.intelligence.run(task);
            resultP.then((result) => {
                const spellErrors = this.checkSpelling(task.rsn, task.text, task.start, result);
                if (spellErrors.annotations.length > 0) {
                    for (const annotation of spellErrors.annotations) {
                        this.sharedString.annotateRangeFromPast(
                            { textError: annotation.textError },
                            annotation.globalStartOffset,
                            annotation.globalEndOffset,
                            spellErrors.rsn);
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
    private spellingError(word: string) {
        if (/\b\d+\b/.test(word)) {
            return false;
        } else {
            return !this.dict.contains(word);
        }
    }
    // TODO: use delayed spell check on each modified paragraph
    private spellOp(delta: MergeTree.IMergeTreeOp, intelligence: IIntelligentService) {
        // let setPending = () => {
        //     if (this.pendingWordCheckTimer) {
        //         clearTimeout(this.pendingWordCheckTimer);
        //     }
        //     this.pendingWordCheckTimer = setTimeout(() => {
        //         this.checkPending(intelligence);
        //     }, 300);
        // }
        if (delta.type === MergeTree.MergeTreeDeltaType.INSERT) {
            //            this.pendingCheckInfo = { pos: delta.pos1 };
            //            setPending();
            this.currentWordSpellCheck(intelligence, delta.pos1);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.REMOVE) {
            //            this.pendingCheckInfo = { pos: delta.pos1, rev: true };
            //            setPending();
            this.currentWordSpellCheck(intelligence, delta.pos1, true);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.GROUP) {
            for (let groupOp of delta.ops) {
                this.spellOp(groupOp, intelligence);
            }
        }
    }

    private enqueueParagraph(delta: MergeTree.IMergeTreeOp) {
        if (delta.type === MergeTree.MergeTreeDeltaType.INSERT ||
            delta.type === MergeTree.MergeTreeDeltaType.REMOVE) {
            let pgRef = this.sharedString.client.mergeTree.findTile(delta.pos1,
                this.sharedString.client.getClientId(), "pg");
            let pgMarker: IPgMarker;
            if (!pgRef) {
                pgMarker = { tile: undefined, pos: 0 };
            } else {
                pgMarker = { tile: <MergeTree.Marker> pgRef.tile, pos: pgRef.pos };
            }
            this.pendingParagraphs.push(pgMarker);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.GROUP) {
            for (let groupOp of delta.ops) {
                this.enqueueParagraph(groupOp);
            }
        }
    }

    private setEvents(intelligence: IIntelligentService) {
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
                let delta = <MergeTree.IMergeTreeOp>msg.contents;
                this.pendingSpellChecks.push(delta);
                this.enqueueParagraph(delta);
                this.currentIdleTime = 0;
            }
        });
    }

    private runSpellOp(intelligence: IIntelligentService) {
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
                    offset = this.sharedString.client.mergeTree.getOffset(pg.tile, MergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId());
                }
                const endMarkerPos = this.sharedString.client.mergeTree.findTile(offset,
                    this.sharedString.client.getClientId(), "pg", false);
                let endPos: number;
                if (endMarkerPos) {
                    endPos = endMarkerPos.pos;
                } else {
                    endPos = this.sharedString.client.mergeTree.getLength(MergeTree.UniversalSequenceNumber,
                        this.sharedString.client.getClientId());
                }
                this.offsetMap[offset] = endPos;
            }
            for (let start of Object.keys(this.offsetMap)) {
                const queryString = this.sharedString.client.mergeTree.getText(MergeTree.UniversalSequenceNumber,
                    this.sharedString.client.getClientId(), false, Number(start), this.offsetMap[start]);
                this.enqueNewQuery(intelligence, queryString, Number(start));
            }
            this.offsetMap = {};
            this.pendingParagraphs = [];
        }
    }

    private makeTextErrorInfo(candidate: string) {
        let alternates = this.dict.neighbors(candidate, 2).sort(compareProxStrings);
        if (alternates.length > Speller.altMax) {
            alternates.length = Speller.altMax;
        }
        return {
            alternates,
            text: candidate,
        };
    }

    private currentWordSpellCheck(intelligence: IIntelligentService, pos: number, rev = false) {
        let words = "";
        let fwdWords = "";
        let sentence = "";
        let fwdSentence = "";
        let wordsFound = false;
        let mergeTree = this.sharedString.client.mergeTree;

        let gatherReverse = (segment: MergeTree.Segment) => {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    if (!wordsFound) {
                        words = " " + words;
                    }
                    sentence = " " + sentence;
                    let marker = <MergeTree.Marker>segment;
                    if (marker.hasTileLabel("pg")) {
                        return false;
                    }
                    break;
                case MergeTree.SegmentType.Text:
                    let textSegment = <MergeTree.TextSegment>segment;
                    if (mergeTree.localNetLength(textSegment)) {
                        if (!wordsFound) {
                            words = textSegment.text + words;
                        }
                        sentence = textSegment.text + sentence;
                    }
                    break;
                // TODO: component
                default:
                    throw new Error("Unknown SegmentType");
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

        let gatherForward = (segment: MergeTree.Segment) => {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    if (!wordsFound) {
                        fwdWords = fwdWords + " ";
                    }
                    fwdSentence = fwdSentence + " ";
                    let marker = <MergeTree.Marker>segment;
                    if (marker.hasTileLabel("pg")) {
                        return false;
                    }
                    break;
                case MergeTree.SegmentType.Text:
                    let textSegment = <MergeTree.TextSegment>segment;
                    if (mergeTree.localNetLength(textSegment)) {
                        if (!wordsFound) {
                            fwdWords = fwdWords + textSegment.text;
                        }
                        fwdSentence = fwdSentence + textSegment.text;
                    }
                    break;
                // TODO: component
                default:
                    throw new Error("Unknown SegmentType");
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
            MergeTree.UniversalSequenceNumber, this.sharedString.client.getClientId());
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
                // tslint:disable-next-line:max-line-length
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
                    } else {
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

    private initSpellerService(intelligence: IIntelligentService, queryString: string, startPos: number) {
        if (this.serviceCounter < Speller.spellerParagraphs) {
            if (queryString.length > 0) {
                this.initialQueue.push({
                    end: startPos + queryString.length,
                    rsn: this.sharedString.sequenceNumber,
                    start: startPos,
                    text: queryString,
                });
                ++this.serviceCounter;
            }
        }
    }

    private enqueNewQuery(intelligence: IIntelligentService, queryString: string, startPos: number) {
        if (queryString.length > 0) {
            this.typingQueue.push({
                end: startPos + queryString.length,
                rsn: this.sharedString.sequenceNumber,
                start: startPos,
                text: queryString,
            });
        }
    }

    private checkSpelling(rsn: number, original: string, startPos: number, result: any) {
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
                annotationRanges.push({
                    globalEndOffset: globalStartOffset,
                    globalStartOffset: runningStart,
                    textError: null,
                });
            }
            runningStart = globalEndOffset;

            // Spelling error but no suggestions found. Continue to next critique.
            if (critique.Suggestions.length === 0 || critique.Suggestions[0].Text === "No suggestions") {
                if (critique.CategoryTitle === "Grammar") {
                    annotationRanges.push({
                        globalStartOffset,
                        globalEndOffset,
                        textError: { text: origWord, alternates: altSpellings, color: "paulgreen", explanation: null },
                    });
                } else if (critique.CategoryTitle === "Spelling") {
                    annotationRanges.push({
                        textError: { text: origWord, alternates: altSpellings, color: "paul", explanation: null },
                        globalStartOffset,
                        globalEndOffset,
                    });
                } else {
                    annotationRanges.push({
                        textError: { text: origWord, alternates: altSpellings, color: "paulgolden", explanation: null },
                        globalStartOffset,
                        globalEndOffset,
                    });
                }
                continue;
            }
            // Suggestions found. Create annotation ranges.
            for (let i = 0; i < Math.min(Speller.altMax, critique.Suggestions.length); ++i) {
                altSpellings.push({ text: critique.Suggestions[i].Text, invDistance: i, val: i });
            }
            if (critique.CategoryTitle === "Grammar") {
                annotationRanges.push({
                    globalEndOffset,
                    globalStartOffset,
                    textError: {
                        alternates: altSpellings,
                        color: "paulgreen",
                        explanation: critique.Explanation,
                        text: origWord,
                    },
                });
            } else if (critique.CategoryTitle === "Spelling") {
                annotationRanges.push({
                    globalEndOffset,
                    globalStartOffset,
                    textError: { text: origWord, alternates: altSpellings, color: "paul", explanation: null },
                });
            } else {
                annotationRanges.push({
                    globalEndOffset,
                    globalStartOffset,
                    textError: {
                        alternates: altSpellings,
                        color: "paulgolden",
                        explanation: critique.Explanation,
                        text: origWord,
                    },
                });
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
        private root: MergeTree.SharedString,
        private dict: MergeTree.Collections.TST<number>,
        private intelligence: IIntelligentService) {
    }

    public run() {
        this.root.loaded.then(() => {
            const theSpeller = new Speller(this.root, this.dict, this.intelligence);
            theSpeller.initialSpellCheck();
        });
    }
}
