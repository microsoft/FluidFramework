/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ReferenceType, reservedTileLabelsKey } from "@fluidframework/merge-tree";
import {
    SharedString,
} from "@fluidframework/sequence";

const textSharedStringId = "text";

export class SharedTextDataObject extends DataObject {
    public static get Name() { return "@fluid-example/shared-text"; }

    public static readonly factory = new DataObjectFactory(
        SharedTextDataObject.Name,
        SharedTextDataObject,
        [
            SharedString.getFactory(),
        ],
        {},
    );

    // It's generally not a good pattern to expose the runtime publicly -- here we do it for legacy reasons.
    public get exposedRuntime(): IFluidDataStoreRuntime {
        return this.runtime;
    }

    private _sharedString: SharedString;
    // It's also generally not a good pattern to expose raw data structures publicly.
    public get sharedString(): SharedString {
        return this._sharedString;
    }

    protected async initializingFirstTime() {
        this._sharedString = SharedString.create(this.runtime);
        this._sharedString.insertMarker(0, ReferenceType.Tile, { [reservedTileLabelsKey]: ["pg"] });
        this.root.set(textSharedStringId, this._sharedString.handle);
    }

    protected async hasInitialized() {
        this._sharedString = await this.root.get<IFluidHandle<SharedString>>(textSharedStringId).get();
    }
}

export const SharedTextDataStoreFactory = SharedTextDataObject.factory;
