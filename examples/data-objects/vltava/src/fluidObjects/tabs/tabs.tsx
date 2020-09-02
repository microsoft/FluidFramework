/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
    getFluidObjectFactoryFromInstance,
} from "@fluidframework/aqueduct";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";

export const TabsName = "tabs";

export class TabsFluidObject extends DataObject implements IFluidHTMLView {
    private dataModelInternal: ITabsDataModel | undefined;

    private static readonly factory = new DataObjectFactory(TabsName, TabsFluidObject, [], {});

    public static getFactory() {
        return TabsFluidObject.factory;
    }

    private get dataModel(): ITabsDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Vltava DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IFluidHTMLView() { return this; }

    protected async initializingFirstTime() {
        // create the tabs directory
        this.root.createSubDirectory("tab-ids");
    }

    protected async hasInitialized() {
        const registry = await this.context.containerRuntime.IFluidDataStoreRegistry.get("internalRegistry");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const registryDetails = (registry as IFluidObject).IFluidObjectInternalRegistry!;
        this.dataModelInternal =
            new TabsDataModel(
                this.root,
                registryDetails,
                getFluidObjectFactoryFromInstance(this.context),
                this.getFluidObjectFromDirectory.bind(this),
            );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TabsView dataModel={this.dataModel} />,
            div);
    }
}
