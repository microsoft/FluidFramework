/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidObject,
    IComponentLoadable,
    IResponse,
    IComponent,
} from "@fluidframework/component-core-interfaces";
import { IComponentRuntimeChannel } from "@fluidframework/runtime-definitions";
import { v4 as uuid } from "uuid";
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
    public async createComponentFromUrl(componentUrl: string): Promise<IComponentLoadable> {
        const urlReg = await this.runtime.IComponentRegistry?.get("url");
        if (urlReg?.IComponentRegistry === undefined) {
            throw new Error("Couldn't get url component registry");
        }

        // Calling .get() on the urlReg registry will also add it to the registry if it's not already there.
        const pkgReg = await urlReg.IComponentRegistry.get(componentUrl) as IComponent & IFluidObject;
        let componentRuntime: IComponentRuntimeChannel;
        const id = uuid();
        if (pkgReg?.IFluidExportDefaultFactoryName !== undefined) {
            componentRuntime = await this.context.containerRuntime.createComponent(
                id,
                [
                    ...this.context.packagePath,
                    "url",
                    componentUrl,
                    pkgReg.IFluidExportDefaultFactoryName.getDefaultFactoryName(),
                ]);
        } else if (pkgReg?.IComponentFactory !== undefined) {
            componentRuntime = await this.context.containerRuntime.createComponent(
                id,
                [
                    ...this.context.packagePath,
                    "url",
                    componentUrl,
                ]);
        } else {
            throw new Error(`${componentUrl} is not a factory, and does not provide default component name`);
        }

        const response: IResponse = await componentRuntime.request({ url: "/" });
        let component = response.value as IComponent & IFluidObject;
        if (component.IComponentLoadable === undefined) {
            throw new Error(`${componentUrl} must implement the IComponentLoadable interface to be loaded here`);
        }
        componentRuntime.bindToContext();
        if (component.IComponentCollection !== undefined) {
            component = component.IComponentCollection.createCollectionItem();
            if (component.IComponentLoadable === undefined) {
                throw new Error(`${componentUrl} must implement the IComponentLoadable interface to be loaded here`);
            }
        }

        return component.IComponentLoadable;
    }
}
