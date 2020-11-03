/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { IFluidLastEditedTracker } from "@fluidframework/last-edited-experimental";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

import React from "react";
import ReactDOM from "react-dom";

import { TabsFluidObject } from "../tabs";
import { IVltavaDataModel, VltavaDataModel } from "./dataModel";
import { VltavaView } from "./view";

/**
 * Vltava is an application experience
 */
export class Vltava extends DataObject<IFluidLastEditedTracker> implements IFluidHTMLView {
    private dataModelInternal: IVltavaDataModel | undefined;

    private static readonly factory = new DataObjectFactory(
        "vltava",
        Vltava,
        [],
        { IFluidLastEditedTracker, IFluidLoadable });

    public static getFactory() {
        return Vltava.factory;
    }

    private get dataModel(): IVltavaDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Vltava DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IFluidHTMLView() { return this; }

    protected async initializingFirstTime() {
        const tabsFluidObject = await TabsFluidObject.getFactory().createChildInstance(this.context);
        this.root.set("tabs-component-id", tabsFluidObject.handle);
    }

    protected async hasInitialized() {
        this.dataModelInternal =
            new VltavaDataModel(
                this.root,
                this.context,
                this.runtime,
                await this.providers.IFluidLastEditedTracker);
    }

    /**
     * Will return a new Vltava View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <VltavaView dataModel={this.dataModel} />,
            div);
    }
}
