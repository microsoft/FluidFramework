/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";

export const TabsName = "tabs";

export class TabsComponent extends DataObject implements IFluidHTMLView {
    private dataModelInternal: ITabsDataModel | undefined;

    private static readonly factory = new DataObjectFactory(TabsName, TabsComponent, [], {});

    public static getFactory() {
        return TabsComponent.factory;
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
        const registry = await this.context.containerRuntime.IFluidDataStoreRegistry.get("");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const registryDetails = (registry as IFluidObject).IComponentInternalRegistry!;
        this.dataModelInternal =
            new TabsDataModel(
                this.root,
                registryDetails,
                this.createFluidObject.bind(this),
                this.getFluidObjectFromDirectory.bind(this),
            );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TabsView dataModel={this.dataModel} />,
            div);
    }
}
