// tslint:disable

import * as commander from "commander";
import * as API from "../api";
import * as SharedString from "../merge-tree";
import * as socketStorage from "../socket-storage";

function spellingError(candidate: string) {
    return (candidate.length > 4) && (candidate.length < 8) && candidate.startsWith("B");
}

class Speller {
    static maxWord = 256;
    constructor(public sharedString: SharedString.SharedString) {
    }

    setEvents() {
        this.sharedString.on("op", (msg: API.ISequencedMessage) => {
            if (msg && msg.op) {
                let delta = <API.IMergeTreeOp>msg.op;
                if (delta.type === API.MergeTreeDeltaType.INSERT) {
                    this.currentWordSpellCheck(delta.pos1);
                } else if (delta.type === API.MergeTreeDeltaType.REMOVE) {
                    let pos= delta.pos1;
                    if (pos>0) {
                        // ensure pos within word
                        pos--;
                    }
                    this.currentWordSpellCheck(pos);
                }
            }
        });
    }

    initialSpellCheck() {
        let text = this.sharedString.client.getTextWithPlaceholders();
        let re = /\b\w+\b/g;
        let result: RegExpExecArray;
        do {
            result = re.exec(text);
            if (result) {
                let candidate = result[0];
                if (spellingError(candidate)) {
                    let start = result.index;
                    let end = re.lastIndex;
                    let textErrorInfo = { text: text.substring(start, end), alternates: ["giraffe", "bunny"] };
                    console.log(`spell (${start}, ${end}): ${textErrorInfo.text}`);
                    this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);
                }
            }
        } while (result);
        this.setEvents();
    }

    currentWordSpellCheck(pos: number) {
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
                    if (spellingError(candidate)) {
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

let theSpeller: Speller;
function initSpell(id: string) {
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
