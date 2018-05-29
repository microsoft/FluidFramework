// tslint:disable:whitespace
import clone = require("lodash/clone");
import { core, MergeTree } from "../client-api";
import { SharedString } from "../shared-string";

interface IPgMarker {

    tile: MergeTree.Marker;

    pos: number;
}

function compareProxStrings(a: MergeTree.ProxString<number>, b: MergeTree.ProxString<number>) {
    const ascore = ((a.invDistance * 200) * a.val) + a.val;
    const bscore = ((b.invDistance * 200) * b.val) + b.val;
    return bscore - ascore;
}

class Speller {
    private static altMax = 7;
    private static idleTimeMS = 500;
    private currentIdleTime: number = 0;
    private pendingSpellChecks: MergeTree.IMergeTreeOp[] = [];
    private pendingParagraphs: IPgMarker[] = new Array<IPgMarker>();
    private verbose = false;

    constructor(
        public sharedString: SharedString,
        private dict: MergeTree.TST<number>) {
    }

    public initialSpellCheck() {
        const spellParagraph = (startPG: number, endPG: number, text: string) => {
            const re = /\b\w+\b/g;
            let result: RegExpExecArray;
            do {
                result = re.exec(text);
                if (result) {
                    const candidate = result[0];
                    if (this.spellingError(candidate.toLocaleLowerCase())) {
                        const start = result.index;
                        const end = re.lastIndex;
                        const textErrorInfo = this.makeTextErrorInfo(candidate);
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
        const mergeTree = this.sharedString.client.mergeTree;
        function gatherPG(segment: MergeTree.Segment, segpos: number) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    const marker = segment as MergeTree.Marker;
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
                    const textSegment = segment as MergeTree.TextSegment;
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

        this.setEvents();
    }

    private spellingError(word: string) {
        if (/\b\d+\b/.test(word)) {
            return false;
        } else {
            return !this.dict.contains(word);
        }
    }

    private spellOp(delta: MergeTree.IMergeTreeOp) {
        if (delta.type === MergeTree.MergeTreeDeltaType.INSERT) {
            this.currentWordSpellCheck(delta.pos1);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.REMOVE) {
            this.currentWordSpellCheck(delta.pos1, true);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.GROUP) {
            for (const groupOp of delta.ops) {
                this.spellOp(groupOp);
            }
        }
    }

    private enqueueParagraph(delta: MergeTree.IMergeTreeOp) {
        if (delta.type === MergeTree.MergeTreeDeltaType.INSERT ||
            delta.type === MergeTree.MergeTreeDeltaType.REMOVE) {
            const pgRef = this.sharedString.client.mergeTree.findTile(delta.pos1,
                this.sharedString.client.getClientId(), "pg");
            let pgMarker: IPgMarker;
            if (!pgRef) {
                pgMarker = { tile: undefined, pos: 0 };
            } else {
                pgMarker = { tile: pgRef.tile as MergeTree.Marker, pos: pgRef.pos };
            }
            this.pendingParagraphs.push(pgMarker);
        } else if (delta.type === MergeTree.MergeTreeDeltaType.GROUP) {
            for (const groupOp of delta.ops) {
                this.enqueueParagraph(groupOp);
            }
        }
    }

    private setEvents() {
        const idleCheckerMS = Speller.idleTimeMS / 5;
        setInterval(() => {
            this.currentIdleTime += idleCheckerMS;
            if (this.currentIdleTime >= Speller.idleTimeMS) {
                this.runSpellOp();
                this.currentIdleTime = 0;
            }
        }, idleCheckerMS);
        this.sharedString.on("op", (msg: core.ISequencedObjectMessage) => {
            if (msg && msg.contents) {
                const delta = msg.contents as MergeTree.IMergeTreeOp;
                this.pendingSpellChecks.push(delta);
                this.enqueueParagraph(delta);
                this.currentIdleTime = 0;
            }
        });
    }

    private runSpellOp() {
        if (this.pendingSpellChecks.length > 0) {
            const pendingChecks = clone(this.pendingSpellChecks);
            this.pendingSpellChecks = [];
            for (const delta of pendingChecks) {
                this.spellOp(delta);
            }
        }
    }

    private makeTextErrorInfo(candidate: string) {
        const alternates = this.dict.neighbors(candidate, 2).sort(compareProxStrings);
        if (alternates.length > Speller.altMax) {
            alternates.length = Speller.altMax;
        }
        return {
            alternates,
            text: candidate,
        };
    }

    private currentWordSpellCheck(pos: number, rev = false) {
        let words = "";
        let fwdWords = "";
        let sentence = "";
        let fwdSentence = "";
        let wordsFound = false;
        const mergeTree = this.sharedString.client.mergeTree;

        const gatherReverse = (segment: MergeTree.Segment) => {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    if (!wordsFound) {
                        words = " " + words;
                    }
                    sentence = " " + sentence;
                    const marker = segment as MergeTree.Marker;
                    if (marker.hasTileLabel("pg")) {
                        return false;
                    }
                    break;
                case MergeTree.SegmentType.Text:
                    const textSegment = segment as MergeTree.TextSegment;
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

        const gatherForward = (segment: MergeTree.Segment) => {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    if (!wordsFound) {
                        fwdWords = fwdWords + " ";
                    }
                    fwdSentence = fwdSentence + " ";
                    const marker = segment as MergeTree.Marker;
                    if (marker.hasTileLabel("pg")) {
                        return false;
                    }
                    break;
                case MergeTree.SegmentType.Text:
                    const textSegment = segment as MergeTree.TextSegment;
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

        const segoff = this.sharedString.client.mergeTree.getContainingSegment(pos,
            MergeTree.UniversalSequenceNumber, this.sharedString.client.getClientId());
        if (segoff && segoff.segment) {
            if (segoff.offset !== 0) {
                console.log("expected pos only at segment boundary");
            }
            // assumes op has made pos a segment boundary
            this.sharedString.client.mergeTree.leftExcursion(segoff.segment, gatherReverse);
            const startPos = pos - words.length;
            const sentenceStartPos = pos - sentence.length;

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
                const re = /\b\w+\b/g;
                let result: RegExpExecArray;
                do {
                    result = re.exec(words);
                    if (result) {
                        const start = result.index + startPos;
                        const end = re.lastIndex + startPos;
                        const candidate = result[0];
                        if (this.spellingError(candidate.toLocaleLowerCase())) {
                            const textErrorInfo = this.makeTextErrorInfo(candidate);
                            if (this.verbose) {
                                console.log(`respell (${start}, ${end}): ${textErrorInfo.text}`);
                                let buf = "alternates: ";
                                for (const alt of textErrorInfo.alternates) {
                                    buf += ` ${alt.text}:${alt.invDistance}:${alt.val}`;
                                }
                                console.log(buf);
                            }
                            this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                        } else {
                            if (this.verbose) {
                                // tslint:disable:max-line-length
                                console.log(`spell ok (${start}, ${end}): ${words.substring(result.index, re.lastIndex)}`);
                            }
                            this.sharedString.annotateRange({ textError: null }, start, end);
                        }
                    }
                }
                while (result);
            }
        }
    }
}

export class Spellcheker {
    constructor(
        private root: SharedString,
        private dict: MergeTree.TST<number>) {
    }

    public run() {
        this.root.loaded.then(() => {
            const theSpeller = new Speller(this.root, this.dict);
            theSpeller.initialSpellCheck();
        });
    }
}
