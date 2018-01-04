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

async function run(id: string): Promise<void> {
    // Load in the latest and connect to the document
    const collabDoc = await api.load(id, { blockUpdateMarkers: true });

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
            setTimeout(() => { return; }, 0);
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

const documentId = "test-document-niode-201";
run(documentId).catch((error) => {
    console.error(error);
});
