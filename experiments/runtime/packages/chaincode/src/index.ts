import { Document } from "@prague/api";
import { IChaincode, IRuntime } from "@prague/runtime-definitions";

class Chaincode implements IChaincode {
    constructor(document: Document) {
        // empty
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }
}

export async function instantiate(runtime: IRuntime): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const collabDoc = await Document.Load(runtime);

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

    return new Chaincode(collabDoc);
}
