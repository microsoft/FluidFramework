/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { CollaborativeTextArea } from "@fluidframework/react-inputs";
import { SharedString } from "@fluidframework/sequence";
import React from "react";
import ReactDOM from "react-dom";
/**
 * CollaborativeText uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
 */
export class CollaborativeText extends DataObject {
    constructor() {
        super(...arguments);
        this.textKey = "textKey";
    }
    get IFluidHTMLView() { return this; }
    static get ComponentName() { return "@fluid-example/collaborative-textarea"; }
    static getFactory() { return this.factory; }
    async initializingFirstTime() {
        // Create the SharedString and store the handle in our root SharedDirectory
        const text = SharedString.create(this.runtime);
        this.root.set(this.textKey, text.handle);
    }
    async hasInitialized() {
        // Store the text if we are loading the first time or loading from existing
        this.text = await this.root.get(this.textKey).get();
    }
    /**
     * Renders a new view into the provided div
     */
    render(div) {
        if (this.text === undefined) {
            throw new Error("The SharedString was not initialized correctly");
        }
        ReactDOM.render(React.createElement("div", { className: "text-area" },
            React.createElement(CollaborativeTextArea, { sharedString: this.text })), div);
        return div;
    }
}
CollaborativeText.factory = new DataObjectFactory(CollaborativeText.ComponentName, CollaborativeText, [
    SharedString.getFactory(),
], {});
// Export the CollaborativeText factory as fluidExport for the dynamic component loading scenario
export const fluidExport = CollaborativeText.getFactory();
//# sourceMappingURL=index.js.map