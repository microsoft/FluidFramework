// tslint:disable

import * as commander from "commander";
import * as API from "../api";
import * as SharedString from "../merge-tree";
import * as socketStorage from "../socket-storage";

function spellingError(candidate: string) {
    return (candidate.length > 4) && (candidate.length < 8) && candidate.startsWith("B");
}

class Speller {
    constructor(public sharedString: SharedString.SharedString) {
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
                    let textErrorInfo = { text: text.substring(start,end), alternates: ["giraffe", "bunny"] };
                    console.log(`spell (${start}, ${end}): ${textErrorInfo.text}`);
                    this.sharedString.annotateRange({ textError: textErrorInfo }, start, end);                    
                }
            }
        } while (result);
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
