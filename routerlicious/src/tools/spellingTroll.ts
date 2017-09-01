// tslint:disable
import * as fs from "fs";
import * as path from "path";
import * as Collections from "../merge-tree/collections";
import * as commander from "commander";
import * as API from "../api";
import * as SharedString from "../merge-tree";
import * as socketStorage from "../socket-storage";

function clock() {
    return process.hrtime();
}

function elapsedMilliseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000) + (end[1] / 1000000));
    return duration;
}

function compareProxStrings(a: Collections.ProxString<number>, b: Collections.ProxString<number>) {
    let ascore = ((a.invDistance * 200) * a.val) + a.val;
    let bscore = ((b.invDistance * 200) * b.val) + b.val;
    return bscore - ascore;
}

class Speller {
    static altMax = 7;
    dict = new Collections.TST<number>();
    verbose = true;

    constructor(public sharedString: SharedString.SharedString) {
    }

    spellingError(word: string) {
        if (/\b\d+\b/.test(word)) {
            return false;
        }
        else {
            return !this.dict.contains(word);
        }
    }

    invokePaul() {
        let altSpellings = [];
        altSpellings.push({ text: "thats", invDistance: 0, val: 0});
        altSpellings.push({ text: "this", invDistance: 1, val: 1});
        setTimeout(() => {
            console.log(`Paul is back`);
            console.log(this.sharedString.client.mergeTree.collabWindow.minSeq);
            this.sharedString.annotateRangeFromPast({ textError: { text: "that", alternates: altSpellings, color: "paul"} }, 492, 496, 0);
            console.log(this.sharedString.client.mergeTree.nodeToString(<SharedString.Block>this.sharedString.client.mergeTree.root.children[0], "", 0));
            this.sharedString.setLocalMinSeq(0);
        }, 10000);
    }

    spellOp(delta: SharedString.IMergeTreeOp) {
        if (delta.type === SharedString.MergeTreeDeltaType.INSERT) {
            this.currentWordSpellCheck(delta.pos1);
        } else if (delta.type === SharedString.MergeTreeDeltaType.REMOVE) {
            this.currentWordSpellCheck(delta.pos1, true);
        }
        else if (delta.type === SharedString.MergeTreeDeltaType.GROUP) {
            for (let groupOp of delta.ops) {
                this.spellOp(groupOp);
            }
        }
    }

    setEvents() {
        this.sharedString.on("op", (msg: API.ISequencedObjectMessage) => {
            if (msg && msg.contents) {
                this.spellOp(<SharedString.IMergeTreeOp>msg.contents);
            }
        });
    }

    loadDict() {
        let clockStart = clock();
        let dictFilename = path.join(__dirname, "../../public/literature/dictfreq.txt");
        let dictContent = fs.readFileSync(dictFilename, "utf8");
        let splitContent = dictContent.split("\n");
        for (let entry of splitContent) {
            let splitEntry = entry.split(";");
            this.dict.put(splitEntry[0], parseInt(splitEntry[1]));
        }
        console.log(`size: ${this.dict.size()}; load time ${elapsedMilliseconds(clockStart)}ms`);
    }

    initialSpellCheck() {
        this.loadDict();
        this.invokePaul();
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
        let prevPG: SharedString.Marker;
        let startPGPos = 0;
        let pgText = "";
        let endMarkerFound = false;

        function gatherPG(segment: SharedString.Segment, segpos: number) {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    let marker = <SharedString.Marker>segment;
                    if (marker.netLength()) {
                        if (marker.hasLabel("pg")) {
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
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
                    if (textSegment.netLength()) {
                        pgText += textSegment.text;
                    }
                    break;
            }
            return true;
        }

        do {
            endMarkerFound = false;
            this.sharedString.client.mergeTree.mapRange({ leaf: gatherPG }, SharedString.UniversalSequenceNumber,
                this.sharedString.client.getClientId(), undefined, startPGPos);
        } while (endMarkerFound);

        if (prevPG) {
            // TODO: send paragraph to service
            spellParagraph(startPGPos, startPGPos + pgText.length, pgText);
        }

        this.setEvents();
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

    currentWordSpellCheck(pos: number, rev = false) {
        let words = "";
        let fwdWords = "";
        let sentence = "";
        let fwdSentence = "";
        let wordsFound = false;

        let gatherReverse = (segment: SharedString.Segment) => {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    if (!wordsFound) {
                        words = " " + words;
                    }
                    sentence = " " + sentence;
                    let marker = <SharedString.Marker>segment;
                    if (marker.hasLabel("pg")) {
                        return false;
                    }
                    break;
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
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

        let gatherForward = (segment: SharedString.Segment) => {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    if (!wordsFound) {
                        fwdWords = fwdWords + " ";
                    }
                    fwdSentence = fwdSentence + " ";
                    let marker = <SharedString.Marker>segment;
                    if (marker.hasLabel("pg")) {
                        return false;
                    }
                    break;
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
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
            SharedString.UniversalSequenceNumber, this.sharedString.client.getClientId());
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
}

let theSpeller: Speller;
async function initSpell(id: string) {

    const document = await API.load(id, { blockUpdateMarkers: true, localMinSeq: 0, encrypted: undefined });
    const root = await document.getRoot().getView();
    if (!root.has("text")) {
        root.set("text", document.createString());
    }
    const sharedString = root.get("text") as SharedString.SharedString;
    console.log("partial load fired");
    sharedString.loaded.then(() => {
        theSpeller = new Speller(sharedString);
        theSpeller.initialSpellCheck();
    });
}

// Process command line input
let sharedStringId;

commander.version("0.0.1")
    .option("-s, --server [server]", "server url", "http://localhost:3000")
    .option("-t, --storage [server]", "storage server url", "http://localhost:3001")
    .option("-r, --repository [repo]", "git repository", "prague")
    .arguments("<id>")
    .action((id: string) => {
        sharedStringId = id;
    })
    .parse(process.argv);


if (!sharedStringId) {
    commander.help();
}
else {
    // Mark socket storage as our default provider
    socketStorage.registerAsDefault(commander.server, commander.storage, commander.repository);
    initSpell(sharedStringId);
}
