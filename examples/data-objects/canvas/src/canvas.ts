/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IInk, Ink } from "@fluidframework/ink";

export class Canvas extends DataObject {
    private _ink: IInk | undefined;

    public get ink() {
        if (this._ink === undefined) {
            throw new Error("Ink should be defined before access");
        }
        return this._ink;
    }

    protected async initializingFirstTime() {
        this.root.set("ink", Ink.create(this.runtime).handle);
    }

    protected async hasInitialized() {
        // Wait here for the ink
        const handle = await this.root.wait<IFluidHandle<IInk>>("ink");
        this._ink = await handle.get();
    }
}
