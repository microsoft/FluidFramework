/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// inspiration for this example taken from https://github.com/agentcooper/typescript-play
import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { MonacoRunnerView } from "./view";

/**
 * Component for using the Monaco text editor.
 */
export class MonacoRunner extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private _text: SharedString | undefined;
    public get text(): SharedString {
        if(this._text === undefined) {
            throw new Error("Text not loaded");
        }
        return this._text;
    }

    private view: MonacoRunnerView | undefined;

    public render(elm: HTMLElement): void {
        if (this.view === undefined) {
            this.view = new MonacoRunnerView(this.text);
        }
        this.view.render(elm);
    }

    /**
     * Creates the SharedString and inserts some sample text. create() is called only once
     * per component.
     */
    protected async initializingFirstTime() {
        const codeString = SharedString.create(this.runtime);
        codeString.insertText(0, 'console.log("Hello, world!");');
        this.root.set("text", codeString.handle);
    }

    protected async hasInitialized(): Promise<void> {
        const textHandle = this.root.get<IFluidHandle<SharedString>>("text");
        if (textHandle === undefined) {
            throw new Error("Text improperly initialized");
        }
        this._text = await textHandle.get();
    }
}
