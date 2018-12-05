import * as api from "@prague/client-api";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";

// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "gallant-hugle";
// const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = "test-sequence-1204-2";
const user = {
    id: "test",
};

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(routerlicious, historian);
api.registerDocumentService(documentServices);

async function run(id: string): Promise<void> {
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user,
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await api.load(
        id,
        tenantId,
        user,
        new socketStorage.TokenProvider(token),
        { blockUpdateMarkers: true, token });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!collabDoc.existing) {
        rootView.set("text", collabDoc.createString());
    } else {
        await rootView.wait("text");
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
