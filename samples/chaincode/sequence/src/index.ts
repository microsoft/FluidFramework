/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component, Document as DatastoreDocument } from "@prague/app-component";
import { IChaincode } from "@prague/runtime-definitions";
import { SharedString } from "@prague/sequence";

const html = `
    <div>
        <h1>Sequence Example</h1>
        <p>
            Type in some text in the form below, choose an insertion location, and then click the insert button
            to insert that text into a collaborative string.
        </p>
        <p>
            <form class="form-inline sequence-insert-form">
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
            <div class="sequence-text"></div>
        </p>
    </div>
`;

class Sequence extends DatastoreDocument {
    public async opened(): Promise<void> {
        const rootView = await this.root.getView();
        console.log("Keys");
        console.log(rootView.keys());

        // Load the text string and listen for updates
        const text = await rootView.wait<SharedString>("text");

        const div = await this.platform.queryInterface<HTMLDivElement>("div");

        if (div) {
            div.innerHTML = html;

            const textElement = div.querySelector(".sequence-text") as HTMLDivElement;
            textElement.innerText = text.getText();

            // Update the text after being loaded as well as when receiving ops
            text.loaded.then(() => {
                textElement.innerText = text.getText();
            });

            text.on("op", (msg) => {
                textElement.innerText = text.getText();
            });

            const insertElement = div.querySelector(".sequence-insert-form") as HTMLFormElement;
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
                console.log(`WOOOTEXT----Text: ${text.getText()}`);
            });
        }
    }

    protected async create() {
        this.root.set("text", this.createString());
    }
}

export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new Sequence());
}
