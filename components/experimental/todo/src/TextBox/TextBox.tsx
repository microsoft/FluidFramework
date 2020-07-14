/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@fluidframework/aqueduct";
import { CollaborativeTextArea } from "@fluidframework/react-inputs";
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { SharedString } from "@fluidframework/sequence";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TextBoxName = `${pkg.name as string}-textbox`;

/**
 * TextBox is a really simple component that uses the CollaborativeTextArea to provide a
 * collaborative textarea.
 */
export class TextBox extends PrimedComponent<{}, string> implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private text: SharedString | undefined;

    /**
     * Do creation work
     */
    protected async componentInitializingFirstTime(initialState?: string) {
        // if initial state is provided then use it.
        const newItemText = initialState ?? "Important Things";

        // Create a SharedString that will be use for the text entry
        const text = SharedString.create(this.runtime);
        text.insertText(0, newItemText);
        this.root.set("text", text.IFluidHandle);
    }

    protected async componentHasInitialized() {
        this.text = await this.root.get<IFluidHandle<SharedString>>("text").get();
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        ReactDOM.render(
            <CollaborativeTextArea sharedString={this.text} />,
            div,
        );
    }

    // end IComponentHTMLView
}
