/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";
import { FluidEditor } from "./FluidEditor";
import { insertBlockStart } from "./RichTextAdapter";
import { MemberList } from "./MemberList";

export class DraftJsObject extends DataObject implements IFluidHTMLView {
    private text: SharedString | undefined;
    private authors: SharedMap | undefined;

    public get IFluidHTMLView() { return this; }

    public static get ComponentName() { return "@fluid-example/draft-js"; }

    public static readonly factory = new DataObjectFactory(
        DraftJsObject.ComponentName,
        DraftJsObject,
        [SharedMap.getFactory(), SharedString.getFactory()],
        {},
    );

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        const text = SharedString.create(this.runtime);
        insertBlockStart(text, 0);
        text.insertText(text.getLength(), "starting text");
        this.root.set("text", text.handle);

        const authors = SharedMap.create(this.runtime);
        this.root.set("authors", authors.handle);
    }

    protected async hasInitialized() {
        [this.text, this.authors] = await Promise.all([this.root.get("text").get(), this.root.get("authors").get()]);
    }

    /**
     * Will return a new view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div style={{ margin: "20px auto", maxWidth: 800 }}>
                <MemberList quorum={this.runtime.getQuorum()} dds={this.authors} style={{ textAlign: "right" }} />
                <FluidEditor sharedString={this.text} authors={this.authors} runtime={this.runtime} />
            </div>,
            div,
        );
    }
}
