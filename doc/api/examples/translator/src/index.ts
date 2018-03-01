import { load } from "@prague/routerlicious/dist/api";
import { SharedString } from "@prague/routerlicious/dist/merge-tree";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import { diffChars } from "diff";
import * as request from "request";
import { parseString } from "xml2js";

// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
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

async function run(id: string, language: string, translateDocId: string): Promise<void> {
    // Load in the latest and connect to the document
    const collabDoc = await load(id, { blockUpdateMarkers: true });
    const rootView = await collabDoc.getRoot().getView();
    const sharedString = rootView.get("text") as SharedString;

    const translationDoc = await load(translateDocId, { blockUpdateMarkers: true });
    const translationRootView = await translationDoc.getRoot().getView();
    if (!translationRootView.has("text")) {
        translationRootView.set("text", translationDoc.createString());
    }
    const translationString = translationRootView.get("text") as SharedString;

    sharedString.on("op", () => {
        const from = "en";
        const text = sharedString.client.getText();

        translate(from, language, text).then((translation) => {
            let cursor = 0;
            const diff = diffChars(translationString.client.getText(), translation);

            for (const change of diff) {
                if (change.removed) {
                    translationString.removeText(cursor, cursor + change.count);
                } else {
                    if (change.added) {
                        translationString.insertText(change.value, cursor);
                    }
                    cursor += change.count;
                }
            }
        });
    });
}

async function start(): Promise<void> {
    const documentId = process.argv[2] || "test-translation";
    const language = process.argv[3] || "el";
    const translatedDocId = process.argv[4] || `${documentId}-${language}`;

    return run(documentId, language, translatedDocId);
}

start().catch((error) => {
    console.error(error);
});
