/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidLastEditedTracker,
    IProvideFluidLastEditedTracker,
    LastEditedTrackerDataObject,
} from "@fluid-experimental/last-edited";
import { IFluidHTMLView, IProvideFluidHTMLView } from "@fluidframework/view-interfaces";
import { Vltava } from "../vltava";

/**
 * Anchor is a Data Object responsible for managing creation and the default Fluid Object
 */
export class Anchor extends DataObject implements IProvideFluidHTMLView, IProvideFluidLastEditedTracker {
    private readonly defaultFluidObjectId = "default-fluid-object-id";
    private defaultFluidObjectInternal: IFluidHTMLView | undefined;
    private readonly lastEditedFluidObjectId = "last-edited-fluid-object-id";
    private lastEditedFluidObject: IFluidLastEditedTracker | undefined;

    private get defaultFluidObject() {
        if (!this.defaultFluidObjectInternal) {
            throw new Error("Default FluidObject was not initialized properly");
        }

        return this.defaultFluidObjectInternal;
    }

    private static readonly factory =
        new DataObjectFactory(
            "anchor",
            Anchor,
            [],
            {},
            [
                LastEditedTrackerDataObject.getFactory().registryEntry,
                Vltava.getFactory().registryEntry,
            ],
        );

    public static getFactory() {
        return Anchor.factory;
    }

    public get IFluidHTMLView() { return this.defaultFluidObject; }

    public get IFluidLastEditedTracker() {
        if (!this.lastEditedFluidObject) {
            throw new Error("LastEditedTrackerDataObject was not initialized properly");
        }

        return this.lastEditedFluidObject;
    }

    protected async initializingFirstTime() {
        const defaultFluidObject = await Vltava.getFactory().createChildInstance(this.context);
        this.root.set(this.defaultFluidObjectId, defaultFluidObject.handle);

        const lastEditedFluidObject = await LastEditedTrackerDataObject.getFactory().createChildInstance(this.context);
        this.root.set(this.lastEditedFluidObjectId, lastEditedFluidObject.handle);
    }

    protected async hasInitialized() {
        this.defaultFluidObjectInternal =
            (await this.root.get<IFluidHandle<IFluidHTMLView>>(this.defaultFluidObjectId)?.get())
                ?.IFluidHTMLView;

        this.lastEditedFluidObject =
            (await this.root.get<IFluidHandle<IFluidLastEditedTracker>>(this.lastEditedFluidObjectId)?.get())
                ?.IFluidLastEditedTracker;
    }
}
