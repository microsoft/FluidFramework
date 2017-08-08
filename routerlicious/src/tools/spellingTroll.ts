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
    static maxWord = 256;
    dict = new Collections.TST<number>();
    verbose = false;

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

    setEvents() {
        this.sharedString.on("op", (msg: API.ISequencedMessage) => {
            if (msg && msg.op) {
                let delta = <API.IMergeTreeOp>msg.op;
                if (delta.type === API.MergeTreeDeltaType.INSERT) {
                    this.currentWordSpellCheck(delta.pos1);
                } else if (delta.type === API.MergeTreeDeltaType.REMOVE) {
                    this.currentWordSpellCheck(delta.pos1, true);
                }
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
                    if (this.verbose) {
                        console.log(`spell (${start}, ${end}): ${textErrorInfo.text}`);
                    }
                    this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                }
            }
        } while (result);
        this.setEvents();
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

    currentWordSpellCheck(pos: number, rev = false) {
        let words = "";
        let fwdText = "";

        let gatherReverse = (segment: SharedString.Segment) => {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    words = " " + words;
                    break;
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
                    if (textSegment.netLength()) {
                        // not removed
                        words = textSegment.text + words;
                    }
                    break;
                // TODO: component
            }
            // console.log(`rev: -${text}-`);
            if (/\s+\w+/.test(words)) {
                return false;
            }
            else {
                return true;
            }
        };

        let gatherForward = (segment: SharedString.Segment) => {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    fwdText = fwdText + " ";
                    break;
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
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
            SharedString.UniversalSequenceNumber, this.sharedString.client.getClientId());
        if (segoff.offset !== 0) {
            console.log("expected pos only at segment boundary");
        }
        // assumes op has made pos a segment boundary
        this.sharedString.client.mergeTree.leftExcursion(segoff.segment, gatherReverse);
        let startPos = pos - words.length;
        if (segoff.segment) {
            if (gatherForward(segoff.segment)) {
                this.sharedString.client.mergeTree.rightExcursion(segoff.segment, gatherForward);
            }
            words = words + fwdText;
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
function initSpell(id: string) {
    SharedString.MergeTree.blockUpdateMarkers = true;
    const extension = API.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
    const sharedString = extension.load(id, API.getDefaultServices(), API.defaultRegistry) as SharedString.SharedString;
    sharedString.on("partialLoad", (data) => {
        console.log("partial load fired");
    });
    sharedString.on("loadFinshed", (data: API.MergeTreeChunk, existing: boolean) => {
        theSpeller = new Speller(sharedString);
        theSpeller.initialSpellCheck();
    });
}

// Process command line input
let sharedStringId;

commander.version("0.0.1")
    .option("-s, --server [server]", "server url", "http://localhost:3000")
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
    socketStorage.registerAsDefault(commander.server);
    initSpell(sharedStringId);
}
