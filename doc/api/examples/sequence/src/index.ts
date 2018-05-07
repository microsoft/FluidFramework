import { api as prague } from "@prague/routerlicious";
import * as jwt from "jsonwebtoken";

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";
const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = "test-sequence-0507-1";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function run(id: string): Promise<void> {
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true, token });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!rootView.has("text")) {
        rootView.set("text", collabDoc.createString());
    }

    // Load the text string and listen for updates
    const text = rootView.get("text");

    const textElement = document.getElementById("text");
    textElement.innerText = text.client.getText();

    // Update the text after being loaded as well as when receiving ops
    text.loaded.then(() => {
        textElement.innerText = text.client.getText();
    });
    text.on("op", (msg) => {
        textElement.innerText = text.client.getText();
    });

    const insertElement = document.getElementById("insertForm") as HTMLFormElement;
    insertElement.onsubmit = (event) => {
        const insertText = (insertElement.elements.namedItem("insertText") as HTMLInputElement).value;
        const insertPosition = parseInt(
            (insertElement.elements.namedItem("insertLocation") as HTMLInputElement).value,
            10);

        text.insertText(insertText, insertPosition);

        event.preventDefault();
    };
}

run(documentId).catch((error) => {
    console.error(error);
});
