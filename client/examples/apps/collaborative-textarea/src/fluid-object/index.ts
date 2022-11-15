/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence";

/**
 * CollaborativeText uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
 */
export class CollaborativeText extends DataObject {
    private readonly textKey = "textKey";

    private _text: SharedString | undefined;
    public get text() {
        if (this._text === undefined) {
            throw new Error("The SharedString was not initialized correctly");
        }
        return this._text;
    }

    public static get Name() { return "@fluid-example/collaborative-textarea"; }

    private static readonly factory =
        new DataObjectFactory(
            CollaborativeText.Name,
            CollaborativeText,
            [
                SharedString.getFactory(),
            ],
            {},
        );

    public static getFactory() { return this.factory; }

    protected async initializingFirstTime() {
        // Create the SharedString and store the handle in our root SharedDirectory
        const text = SharedString.create(this.runtime);
        this.root.set(this.textKey, text.handle);
    }

    protected async hasInitialized() {
        // Store the text if we are loading the first time or loading from existing
        this._text = await this.root.get<IFluidHandle<SharedString>>(this.textKey)?.get();
    }
}
