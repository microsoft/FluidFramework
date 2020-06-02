/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { CollaborativeTextArea } from "@fluidframework/aqueduct-react";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import { SharedString } from "@fluidframework/sequence";

import React from "react";
import ReactDOM from "react-dom";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";

/**
 * CollaborativeText uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
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

    protected async componentInitializingFirstTime() {
        // Create the SharedString and store the handle in our root SharedDirectory
        const text = SharedString.create(this.runtime);
        this.root.set(this.textKey, text.handle);
    }

    protected async componentHasInitialized() {
        // Store the text if we are loading the first time or loading from existing
        this.text = await this.root.get<IComponentHandle<SharedString>>(this.textKey).get();
    }

    /**
     * Renders a new view into the provided div
     */
    public render(div: HTMLElement) {
        if (this.text === undefined) {
            throw new Error("The SharedString was not initialized correctly");
        }

        ReactDOM.render(
            <div className="text-area">
                <CollaborativeTextArea sharedString={this.text}/>
            </div>,
            div,
        );
        return div;
    }
}

// Export the CollaborativeText factory as fluidExport for the dynamic component loading scenario
export const fluidExport = CollaborativeText.getFactory();
