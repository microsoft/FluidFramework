import * as querystring from "querystring";
import * as request from "request";
import * as api from "../api";
import * as mergeTree from "../merge-tree";
import * as socketStorage from "../socket-storage";

interface IAttachedObject {
    getText: () => string;
    insertText: (text: string, position: number) => void;
    on: (callback: (param: any) => void) => void;
}

declare function pragueAttach(object: IAttachedObject): void;

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

// Register endpoint connection
socketStorage.registerAsDefault(routerlicious, historian, repository);

function getLatestVersion(id: string): Promise<any> {
    const query = querystring.stringify({
        count: 1,
        sha: id,
    });

    const url = `/repos/${encodeURIComponent(repository)}/commits?${query}`;

    const options: request.OptionsWithUrl = {
        json: true,
        method: "GET",
        url: `${historian}${url}`,
    };

    const versionsP = new Promise<any>((resolve, reject) => {
        request(
            options,
            (error, response, body) => {
                if (error) {
                    return reject(error);
                } else if (response.statusCode !== 200) {
                    return reject(response.statusCode);
                } else {
                    return resolve(response.body[0]);
                }
            });
    });

    return versionsP.catch((error) => error === 400 ? null : Promise.reject<any>(error));
}

async function run(id: string): Promise<void> {
    // Get the latest version of the document
    const version = await getLatestVersion(id);
    console.log(version);

    // Load in the latest and connect to the document
    const collabDoc = await api.load(id, { blockUpdateMarkers: true }, version);

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!rootView.has("text")) {
        rootView.set("text", collabDoc.createString());
    }

    // Load the text string and listen for updates
    const text = rootView.get("text") as mergeTree.SharedString;

    const attached = {
        getText: () => {
            return text.client.getText();
        },
        insertText: (value: string, position: number) => {
            text.insertText(value, position);
        },
        on: (callback) => {
            // Update the text after being loaded as well as when receiving ops
            text.loaded.then(() => {
                callback(text.client.getText());
            });

            text.on("op", (msg) => {
                console.log("op - new text");
                callback(msg);
            });
        },
    };

    pragueAttach(attached);
}

const documentId = "test-document-niode2";
run(documentId).catch((error) => {
    console.error(error);
});
