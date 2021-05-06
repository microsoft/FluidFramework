/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import { IFluidObject, IFluidLoadable } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";

import React from "react";
import ReactDOM from "react-dom";

import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";

export const TabsName = "tabs";

export class TabsFluidObject extends DataObject implements IFluidHTMLView {
    private dataModelInternal: ITabsDataModel | undefined;

    private static readonly factory =
    new DataObjectFactory<TabsFluidObject, undefined, undefined, IEvent>(TabsName, TabsFluidObject, [], {});

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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const registryDetails = (registry as IFluidObject).IFluidObjectInternalRegistry!;
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
