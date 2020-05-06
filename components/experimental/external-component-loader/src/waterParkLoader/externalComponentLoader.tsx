/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentLoadable,
    IResponse,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IPackage } from "@microsoft/fluid-container-definitions";
import { IComponentRuntimeChannel } from "@microsoft/fluid-runtime-definitions";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as uuid from "uuid";
import {
    IComponentCallbacks,
    IProvideComponentCollectorSpaces,
    SpacesCompatibleToolbar,
} from "@fluid-example/spaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ExternalComponentLoaderToolbar } from "./ExternalComponentLoaderToolbar";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../../package.json") as IPackage;
export const WaterParkLoaderName = `${pkg.name}-loader`;

// defaultComponents are the component options that are always available in the waterpark.
const defaultComponents = [
    "@fluid-example/todo",
    "@fluid-example/math",
    "@fluid-example/monaco",
    "@fluid-example/image-collection",
    "@fluid-example/pond",
    "@fluid-example/clicker",
    "@fluid-example/primitives",
    "@fluid-example/table-view",
];

// localComponentUrls facilitates local component development.  Make sure the path points to a directory containing
// the package.json for the package, and also make sure you've run webpack there first.  These will only be
// available when running on localhost.
const localComponentUrls = [
    // "http://localhost:8080/file/C:\\git\\FluidFramework\\components\\experimental\\todo",
    "http://localhost:8080/file/C:\\git\\FluidFramework\\components\\experimental\\clicker",
];

// When locally developing, want to load the latest available patch version by default
const defaultVersionToLoad = pkg.version.endsWith(".0") ? `^${pkg.version}` : pkg.version;
const componentUrls = defaultComponents.map((url) => `${url}@${defaultVersionToLoad}`);

// When running on localhost, add entries for local component development.
if (window.location.hostname === "localhost") {
    componentUrls.push(...localComponentUrls);
}

/**
 * The view component must support certain interfaces to work with the waterpark.
 */
export type WaterParkCompatibleView =
    IComponentHandle & IComponentLoadable & IProvideComponentCollectorSpaces;

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends PrimedComponent
    implements IComponentHTMLView, SpacesCompatibleToolbar {
    private savedElement: HTMLElement | undefined;
    private callbacks: IComponentCallbacks | undefined;

    public get IComponentHTMLView() { return this; }
    public get IComponentCallable() { return this; }

    public setComponentCallbacks(callbacks: IComponentCallbacks) {
        this.callbacks = callbacks;
    }

    public render(element: HTMLElement) {
        if (this.savedElement !== undefined) {
            ReactDOM.unmountComponentAtNode(this.savedElement);
        }

        ReactDOM.render(
            <ExternalComponentLoaderToolbar
                componentUrls={ componentUrls }
                onSelectOption={ this.createAndAddComponent }
                toggleEditable={ this.toggleEditable }
            />,
            element,
        );

        this.savedElement = element;
    }

    private async createComponentFromUrl(componentUrl: string): Promise<IComponentLoadable> {
        const urlReg = await this.runtime.IComponentRegistry?.get("url");
        if (urlReg?.IComponentRegistry === undefined) {
            throw new Error("Couldn't get url component registry");
        }

        const pkgReg = await urlReg.IComponentRegistry.get(componentUrl) as IComponent;
        let componentRuntime: IComponentRuntimeChannel;
        const id = uuid();
        if (pkgReg?.IComponentDefaultFactoryName !== undefined) {
            componentRuntime = await this.context.containerRuntime.createComponent(
                id,
                [
                    ...this.context.packagePath,
                    "url",
                    componentUrl,
                    pkgReg.IComponentDefaultFactoryName.getDefaultFactoryName(),
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
        let component: IComponent = response.value as IComponent;
        if (component.IComponentLoadable === undefined) {
            throw new Error(`${componentUrl} must implement the IComponentLoadable interface to be loaded here`);
        }
        componentRuntime.attach();
        if (component.IComponentCollection !== undefined) {
            component = component.IComponentCollection.createCollectionItem();
            if (component.IComponentLoadable === undefined) {
                throw new Error(`${componentUrl} must implement the IComponentLoadable interface to be loaded here`);
            }
        }

        return component.IComponentLoadable;
    }

    private readonly toggleEditable = () => {
        if (this.callbacks?.setEditable !== undefined) {
            this.callbacks.setEditable();
        }
    };

    private readonly createAndAddComponent = async (componentUrl: string) => {
        if (this.callbacks?.addItem === undefined) {
            throw new Error("Don't have an addItem callback");
        }

        this.callbacks.addItem({
            component: await this.createComponentFromUrl(componentUrl),
            type: componentUrl,
        });
    };
}
