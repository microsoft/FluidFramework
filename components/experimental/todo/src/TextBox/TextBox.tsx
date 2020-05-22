/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@fluidframework/aqueduct";
import { CollaborativeTextArea } from "@fluidframework/aqueduct-react";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { SharedString } from "@fluidframework/sequence";
import { IComponentHTMLView, IComponentReactViewable } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TextBoxName = `${pkg.name as string}-textbox`;

/**
 * TextBox is a really simple component that uses the CollaborativeTextArea to provide a
 * collaborative textarea.
 */
export class TextBox extends PrimedComponent<{}, string> implements IComponentHTMLView, IComponentReactViewable {
    public get IComponentHTMLView() { return this; }
    public get IComponentReactViewable() { return this; }

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
        this.root.set("text", text.handle);
    }

    protected async componentHasInitialized() {
        this.text = await this.root.get<IComponentHandle<SharedString>>("text").get();
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        ReactDOM.render(
            this.createJSXElement(),
            div,
        );
    }

    // end IComponentHTMLView

    // start IComponentReactViewable

    /**
     * If our caller supports React they can query against the IComponentReactViewable
     * Since this returns a JSX.Element it allows for an easier model.
     */
    public createJSXElement(): JSX.Element {
        return (
            <CollaborativeTextArea sharedString={this.text} />
        );
    }

    // end IComponentReactViewable
}
