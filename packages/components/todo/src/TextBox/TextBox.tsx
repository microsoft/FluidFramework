/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { CollaborativeTextArea } from "@microsoft/fluid-aqueduct-react";
import { IComponentHandle, IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";
import { SharedString } from "@microsoft/fluid-sequence";
import { IComponentReactViewable } from "@microsoft/fluid-view-adapters";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TextBoxName = `${pkg.name as string}-textbox`;

/**
 * TextBox is a really simple component that uses the CollaborativeTextArea to provide a
 * collaborative textarea.
 */
export class TextBox extends PrimedComponent implements IComponentHTMLView, IComponentReactViewable {
    public get IComponentHTMLView() { return this; }
    public get IComponentReactViewable() { return this; }

    private text: SharedString;

    /**
     * Do creation work
     */
    protected async componentInitializingFirstTime(props?: any) {
        let newItemText = "Important Things";

        // If the creating component passed props with a startingText value then set it.
        if (props && props.startingText) {
            newItemText = props.startingText;
        }

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
