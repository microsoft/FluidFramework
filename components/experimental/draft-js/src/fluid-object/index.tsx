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

    /**
     * Will return a new view
     */
    public async render(div: HTMLElement) {
        const [text, authors] = await Promise.all([this.root.get("text").get(), this.root.get("authors").get()]);
        ReactDOM.render(
            <div style={{ margin: "20px auto", maxWidth: 800 }}>
                <MemberList quorum={this.runtime.getQuorum()} dds={authors} style={{ textAlign: "right" }} />
                <FluidEditor sharedString={text} authors={authors} runtime={this.runtime} />
            </div>,
            div,
        );
        return div;
    }
}
