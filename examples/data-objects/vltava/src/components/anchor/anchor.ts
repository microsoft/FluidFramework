/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidLastEditedTracker,
    IProvideFluidLastEditedTracker,
    LastEditedTrackerDataObject,
} from "@fluidframework/last-edited-experimental";
import { IFluidHTMLView, IProvideFluidHTMLView } from "@fluidframework/view-interfaces";
import { Vltava } from "../vltava";

export const AnchorName = "anchor";

/**
 * Anchor is an default component is responsible for managing creation and the default component
 */
export class Anchor extends DataObject implements IProvideFluidHTMLView, IProvideFluidLastEditedTracker {
    private readonly defaultComponentId = "default-component-id";
    private defaultComponentInternal: IFluidHTMLView | undefined;
    private readonly lastEditedComponentId = "last-edited-component-id";
    private lastEditedComponent: IFluidLastEditedTracker | undefined;

    private get defaultComponent() {
        if (!this.defaultComponentInternal) {
            throw new Error("Default Component was not initialized properly");
        }

        return this.defaultComponentInternal;
    }

    private static readonly factory = new DataObjectFactory(AnchorName, Anchor, [], {});

    public static getFactory() {
        return Anchor.factory;
    }

    public get IFluidHTMLView() { return this.defaultComponent; }

    public get IFluidLastEditedTracker() {
        if (!this.lastEditedComponent) {
            throw new Error("LastEditedTrackerDataObject was not initialized properly");
        }

        return this.lastEditedComponent;
    }

    protected async initializingFirstTime() {
        const defaultComponent = await Vltava.getFactory().createInstance(this.context);
        this.root.set(this.defaultComponentId, defaultComponent.handle);

        const lastEditedComponent = await LastEditedTrackerDataObject.getFactory().createInstance(this.context);
        this.root.set(this.lastEditedComponentId, lastEditedComponent.handle);
    }

    protected async hasInitialized() {
        this.defaultComponentInternal =
            (await this.root.get<IFluidHandle>(this.defaultComponentId).get())
                .IFluidHTMLView;

        this.lastEditedComponent =
            (await this.root.get<IFluidHandle>(this.lastEditedComponentId).get())
                .IFluidLastEditedTracker;
    }
}
