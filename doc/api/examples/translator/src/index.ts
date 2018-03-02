import { load } from "@prague/routerlicious/dist/api";
import { IMergeTreeOp, MergeTreeDeltaType, SharedString } from "@prague/routerlicious/dist/merge-tree";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as request from "request";
import { parseString } from "xml2js";

// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const owner = "prague";
const repository = "prague";

// Replace the subscriptionKey string value with your valid subscription key.
const subscriptionKey = "bd099a1e38724333b253fcff7523f76a";

socketStorage.registerAsDefault(routerlicious, historian, owner, repository);

async function translate(from: string, to: string, text: string): Promise<string> {
    const params = `from=${from}&to=${to}&text=${encodeURI(text)}`;
    const uri = `https://api.microsofttranslator.com/V2/Http.svc/Translate?${params}`;

    return new Promise<string>((resolve, reject) => {
        request(
            {
                headers: {
                    "Ocp-Apim-Subscription-Key" : subscriptionKey,
                },
                method: "GET",
                uri,
            },
            (err, resp, body) => {
                if (err || resp.statusCode !== 200) {
                    reject(err || body);
                } else {
                    parseString(body, (parseErr, result) => {
                        if (parseErr) {
                            reject(parseErr);
                        } else {
                            resolve(result.string._);
                        }
                    });
                }
            });
    });
}

class Translator {
    constructor(private sharedString: SharedString, private language: string) {
    }

    public start() {
        this.sharedString.on("op", (op) => {
            // Only translate after the document is actually modified
            const mergeTreeOp = op.contents as IMergeTreeOp;
            if (mergeTreeOp.type === MergeTreeDeltaType.INSERT || mergeTreeOp.type === MergeTreeDeltaType.REMOVE) {
                console.log("Translating!");
                this.translate().then(
                    () => {
                        console.log("...DONE");
                    }, (error) => {
                        console.error(error);
                    });
            }
        });
    }

    private async translate(): Promise<void> {
        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");
        const numParagraphs = textAndMarkers.paralellText.length;

        const translationsP: Array<Promise<void>> = [];
        for (let i = 0; i < numParagraphs; i++) {
            const translateP = this.translateParagraph(
                this.sharedString,
                textAndMarkers.paralellText[i],
                textAndMarkers.parallelMarkers[i],
                this.language);
            translationsP.push(translateP);
        }

        await Promise.all(translationsP);
    }

    private async translateParagraph(sharedString: SharedString, parallelText, parallelMarker, language: string) {
        const from = "en";
        const translation = await translate(from, language, parallelText);
        const pos = sharedString.client.mergeTree.getOffset(
            parallelMarker, sharedString.client.getCurrentSeq(), sharedString.client.getClientId());
        sharedString.annotateRange({ translation }, pos, pos + 1);
    }
}

async function run(id: string, language: string): Promise<void> {
    // Load in the latest and connect to the document
    const collabDoc = await load(id, { blockUpdateMarkers: true });
    const rootView = await collabDoc.getRoot().getView();
    const sharedString = rootView.get("text") as SharedString;

    const translator = new Translator(sharedString, language);
    translator.start();
}

async function start(): Promise<void> {
    const documentId = process.argv[2] || "sick-fireman";
    const language = process.argv[3] || "fr";

    return run(documentId, language);
}

start().catch((error) => {
    console.error(error);
});
