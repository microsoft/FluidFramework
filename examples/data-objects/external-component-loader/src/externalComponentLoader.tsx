/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    queryObject,
    IFluidObject,
    IFluidLoadable,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
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
        [["url", Promise.resolve(new UrlRegistry())]],
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
        const pkgReg = await urlReg.IFluidDataStoreRegistry.get(componentUrl) as IFluidObject;
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
        let loadable = queryObject(obj).IFluidLoadable;
        if (loadable === undefined) {
            throw new Error(`${componentUrl} must implement the IFluidLoadable interface to be loaded here`);
        }
        const collection = (queryObject(obj) as IFluidObject).IFluidObjectCollection;
        if (collection !== undefined) {
            obj = collection.createCollectionItem();
            loadable = queryObject(obj).IFluidLoadable;
            if (loadable === undefined) {
                throw new Error(`${componentUrl} must implement the IFluidLoadable interface to be loaded here`);
            }
        }

        return loadable;
    }
}
