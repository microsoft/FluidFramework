/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

import { TabsFluidObject } from "../tabs";
import { IVltavaDataModel, VltavaDataModel } from "./dataModel";
import { VltavaView } from "./view";

const defaultObjectId = "tabs-id";

/**
 * Vltava is an application experience
 */
export class Vltava extends DataObject implements IFluidHTMLView {
    private dataModelInternal: IVltavaDataModel | undefined;

    private static readonly factory =
        new DataObjectFactory("vltava", Vltava, [], {});

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
        const tabsFluidObject = await TabsFluidObject.getFactory().createInstance(this.context.containerRuntime);
        this.root.set(defaultObjectId, tabsFluidObject.handle);
    }

    protected async hasInitialized() {
        this.dataModelInternal =
            new VltavaDataModel(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.root.get<IFluidHandle>(defaultObjectId)!,
                this.context,
                this.runtime);
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
