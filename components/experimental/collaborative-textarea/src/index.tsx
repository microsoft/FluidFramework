/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { CollaborativeTextArea } from "@microsoft/fluid-aqueduct-react";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { SharedString } from "@microsoft/fluid-sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class CollaborativeText extends PrimedComponent implements IComponentHTMLView {
    private readonly textKey = "textKey";

    private text: SharedString | undefined;

    public get IComponentHTMLView() { return this; }

    public static get ComponentName() { return "@fluid-example/collaborative-textarea"; }

    private static readonly factory = new PrimedComponentFactory(
        CollaborativeText.ComponentName,
        CollaborativeText,
        [
            SharedString.getFactory(),
        ],
        {},
    );

    public static getFactory() { return this.factory; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        const text = SharedString.create(this.runtime);
        text.insertText(0, "");
        this.root.set(this.textKey, text.handle);
    }

    protected async componentHasInitialized() {
        this.text = await this.root.get<IComponentHandle<SharedString>>(this.textKey).get();
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        if (this.text === undefined) {
            throw new Error("The SharedString was not initialized correctly");
        }

        // set the class name of the parent div to text-area. This is for testing only.
        div.className = "text-area";

        // Get our counter object that we set in initialize and pass it in to the view.
        ReactDOM.render(
            <CollaborativeTextArea sharedString={this.text}/>,
            div,
        );
        return div;
    }
}

// Export the CollaborativeText factory as fluidExport for the dynamic case
export const fluidExport = CollaborativeText.getFactory();
