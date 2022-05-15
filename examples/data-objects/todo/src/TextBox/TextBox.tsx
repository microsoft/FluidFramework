/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");
export const TextBoxName = `${pkg.name as string}-textbox`;

/**
 * TextBox is a really simple component that uses the CollaborativeTextArea to provide a
 * collaborative textarea.
 */
export class TextBox extends DataObject<{ InitialState: string; }> {
    public text: SharedString | undefined;

    /**
     * Do creation work
     */
    protected async initializingFirstTime(initialState?: string) {
        // if initial state is provided then use it.
        const newItemText = initialState ?? "Important Things";

        // Create a SharedString that will be use for the text entry
        const text = SharedString.create(this.runtime);
        text.insertText(0, newItemText);
        this.root.set("text", text.handle);
    }

    protected async hasInitialized() {
        this.text = await this.root.get<IFluidHandle<SharedString>>("text").get();
    }
}
