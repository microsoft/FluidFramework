/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidObject,
    IFluidLoadable,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { RenamingFactoryAdapter } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { UrlRegistry } from "./urlRegistry";

/**
 * Component that loads external components via their url
 */
export class ExternalComponentLoader extends DataObject {
    public static get ComponentName() { return "@fluid-example/external-component-loader"; }

    private static readonly factory = new DataObjectFactory(
        ExternalComponentLoader.ComponentName,
        ExternalComponentLoader,
        [],
        {},
        [new RenamingFactoryAdapter("url", new UrlRegistry())],
    );

    public static getFactory() {
        return ExternalComponentLoader.factory;
    }

    /**
     * Creates the component retrieved from the given location.  Adds it to the registry dynamically if needed.
     * @param componentUrl - the URL of the component to create, adding it to the registry if needed.
     */
    public async createComponentFromUrl(componentUrl: string): Promise<IFluidLoadable> {
        const urlReg = await this.runtime.IFluidDataStoreRegistry?.get("url");
        if (urlReg?.IFluidDataStoreRegistry === undefined) {
            throw new Error("Couldn't get url component registry");
        }

        // Calling .get() on the urlReg registry will also add it to the registry if it's not already there.
        const pkgReg = await urlReg.IFluidDataStoreRegistry.get(componentUrl) as IFluidObject & IFluidObject;
        let router: IFluidRouter;
        if (pkgReg?.IFluidExportDefaultFactoryName !== undefined) {
            router = await this.context.containerRuntime.createDataStore(
                [
                    ...this.context.packagePath,
                    "url",
                    componentUrl,
                    pkgReg.IFluidExportDefaultFactoryName.getDefaultFactoryName(),
                ]);
        } else if (pkgReg?.IFluidDataStoreFactory !== undefined) {
            router = await this.context.containerRuntime.createDataStore(
                [
                    ...this.context.packagePath,
                    "url",
                    componentUrl,
                ]);
        } else {
            throw new Error(`${componentUrl} is not a factory, and does not provide default component name`);
        }

        let obj = await requestFluidObject(router, "/");
        if (obj.IFluidLoadable === undefined) {
            throw new Error(`${componentUrl} must implement the IFluidLoadable interface to be loaded here`);
        }
        if (obj.IFluidObjectCollection !== undefined) {
            obj = obj.IFluidObjectCollection.createCollectionItem();
            if (obj.IFluidLoadable === undefined) {
                throw new Error(`${componentUrl} must implement the IFluidLoadable interface to be loaded here`);
            }
        }

        return obj.IFluidLoadable;
    }
}
