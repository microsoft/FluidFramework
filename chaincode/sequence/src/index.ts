import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { Document } from "./document";

const html = `
<div class="container">
        <h1>Sequence Example</h1>
        <p>
            Type in some text in the form below, choose an insertion location, and then click the insert button
            to insert that text into a collaborative string.
        </p>
        <p>
            <form id="insertForm" class="form-inline">
                <div class="form-group">
                    <label for="insertText">Text</label>
                    <input id="insertText" type="text" class="form-control">
                </div>
                <div class="form-group">
                    <label for="insertLocation">Location</label>
                    <input id="insertLocation" type="text" class="form-control" value="0">
                </div>
                <button type="submit" class="btn btn-default">Insert</button>
            </form>
        </p>

        <p>
            <div id="text"></div>
        </p>
    </div>
`;

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
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

        const dom = platform ? platform.queryInterface<Document>("dom") : null;

        if (dom) {
            dom.getElementById("content").innerHTML = html;

            const textElement = dom.getElementById("text");
            textElement.innerText = text.client.getText();

            // Update the text after being loaded as well as when receiving ops
            text.loaded.then(() => {
                textElement.innerText = text.client.getText();
            });

            text.on("op", (msg) => {
                textElement.innerText = text.client.getText();
            });

            const insertElement = dom.getElementById("insertForm") as HTMLFormElement;
            insertElement.onsubmit = (event) => {
                const insertText = (insertElement.elements.namedItem("insertText") as HTMLInputElement).value;
                const insertPosition = parseInt(
                    (insertElement.elements.namedItem("insertLocation") as HTMLInputElement).value,
                    10);

                text.insertText(insertText, insertPosition);

                event.preventDefault();
            };
        } else {
            text.on("op", () => {
                console.log(`WOOOTEXT----Text: ${text.client.getText()}`);
            });
        }
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
