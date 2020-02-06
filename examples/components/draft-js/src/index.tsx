/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
    SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { SharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { FluidEditor } from "./FluidEditor";
import { insertBlockStart } from "./RichTextAdapter";
import { MemberList } from "./MemberList";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const DraftJsName = pkg.name as string;

export class DraftJsExample extends PrimedComponent implements IComponentHTMLView, IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
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

// ----- COMPONENT SETUP STUFF -----
export const DraftInstantiationFactory = new PrimedComponentFactory(
    DraftJsExample,
    [SharedMap.getFactory(), SharedString.getFactory()],
);

export const fluidExport = new SimpleModuleInstantiationFactory(
    DraftJsName,
    new Map([[DraftJsName, Promise.resolve(DraftInstantiationFactory)]]),
);
