import { load } from "@prague/routerlicious/dist/api";
import { IMergeTreeOp, MergeTreeDeltaType } from "@prague/routerlicious/dist/merge-tree";
import { SharedString } from "@prague/routerlicious/dist/shared-string";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as jwt from "jsonwebtoken";
import * as request from "request";
import { Builder, parseString } from "xml2js";

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";
const secret = "03302d4ebfb6f44b662d00313aff5a46";

// Replace the subscriptionKey string value with your valid subscription key.
const subscriptionKey = "bd099a1e38724333b253fcff7523f76a";

socketStorage.registerAsDefault(routerlicious, historian, tenantId);

function createRequestBody(from: string, to: string, texts: string[]): string {
    const builder = new Builder({ rootName: "TranslateArrayRequest", headless: true });

    const object = {
        AppId: "",
        From: from,
        Options: {
            ContentType: "text/xml",
        },
        Texts: {
            string: texts,
        },
        To: to,
    };

    return builder.buildObject(object);
}

async function translate(from: string, to: string, text: string[]): Promise<string[]> {
    const uri = `https://api.microsofttranslator.com/V2/Http.svc/TranslateArray`;

    const requestBody = createRequestBody(from, to, text).replace(
        /<string>/g,
        "<string xmlns=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\">");

    console.log(requestBody);

    return new Promise<string[]>((resolve, reject) => {
        request(
            {
                body: requestBody,
                headers: {
                    "Content-Type": "text/xml",
                    "Ocp-Apim-Subscription-Key" : subscriptionKey,
                },
                method: "POST",
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
                            console.log(JSON.stringify(result));
                            const translations = result.ArrayOfTranslateArrayResponse.TranslateArrayResponse.map(
                                (value) => value.TranslatedText[0]);
                            resolve(translations);
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
        const from = "en";

        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");
        const numParagraphs = textAndMarkers.paralellText.length;

        const translations = await translate(from, this.language, textAndMarkers.paralellText);
        console.log(translations);
        for (let i = 0; i < numParagraphs; i++) {
            const translation = translations[i];

            const pos = this.sharedString.client.mergeTree.getOffset(
                textAndMarkers.parallelMarkers[i],
                this.sharedString.client.getCurrentSeq(),
                this.sharedString.client.getClientId());

            const props: any = {};
            props[`translation-${this.language}`] = translation;
            this.sharedString.annotateRange(props, pos, pos + 1);
        }
    }
}

async function run(id: string, language: string): Promise<void> {
    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await load(id, { blockUpdateMarkers: true, token });
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
