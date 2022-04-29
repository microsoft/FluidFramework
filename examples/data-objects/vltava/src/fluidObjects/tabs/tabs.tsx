/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

import React from "react";
import ReactDOM from "react-dom";

import { IProvideFluidObjectInternalRegistry } from "../../interfaces";
import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";

export const TabsName = "tabs";

export class TabsFluidObject extends DataObject implements IFluidHTMLView {
    private dataModelInternal: ITabsDataModel | undefined;

    private static readonly factory =
    new DataObjectFactory(TabsName, TabsFluidObject, [], {});

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

    protected async hasInitialized() {
        // TODO: This code should not rely on container globals (i.e. IContainerRuntime)
        // It should be refactored to pass dependencies in.
        const runtime = this.context.containerRuntime as IContainerRuntime;

        const registry = await runtime.IFluidDataStoreRegistry.get("internalRegistry");
        const registryDetails = (registry as IProvideFluidObjectInternalRegistry).IFluidObjectInternalRegistry;
        this.dataModelInternal =
            new TabsDataModel(
                this.root,
                registryDetails,
                async (factory: IFluidDataStoreFactory) => {
                    const router = await this.context.containerRuntime.createDataStore([factory.type]);
                    return requestFluidObject<IFluidLoadable>(router, "/");
                },
                this.getFluidObjectFromDirectory.bind(this),
            );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TabsView dataModel={this.dataModel} />,
            div);
    }
}
