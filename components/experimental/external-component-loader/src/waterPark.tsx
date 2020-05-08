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
    ISpacesStorageModel,
    SpacesStorage,
    SpacesStorageView,
} from "@fluid-example/spaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { ExternalComponentLoaderToolbarView } from "./waterParkLoader/ExternalComponentLoaderToolbar";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../../package.json") as IPackage;
export const WaterParkLoaderName = `${pkg.name}-loader`;

const storageKey = "storage";

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
    IComponentHandle & IComponentLoadable & ISpacesStorageModel;

/**
 * WaterPark assembles the SpacesStorage with a custom toolbar that can load other components
 */
export class WaterPark extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private storage: SpacesStorage | undefined;

    public render(element: HTMLElement) {
        if (this.storage === undefined) {
            throw new Error("Can't render, storage not found");
        }
        ReactDOM.render(
            <WaterParkView storage={this.storage} />,
            element,
        );
    }

    protected async componentInitializingFirstTime() {
        const storage = await this.createAndAttachComponent(SpacesStorage.ComponentName);
        this.root.set(storageKey, storage);
    }

    protected async componentHasInitialized() {
        this.storage = await this.root.get<IComponentHandle<SpacesStorage>>(storageKey)?.get();
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

    private readonly createAndAddComponent = async (componentUrl: string) => {
        if (this.props?.addItem === undefined) {
            throw new Error("Don't have an addItem callback");
        }

        this.props.addItem({
            component: await this.createComponentFromUrl(componentUrl),
            type: componentUrl,
        });
    };
}

interface IWaterParkViewProps {
    storage: SpacesStorage;
}
export const WaterParkView: React.FC<IWaterParkViewProps> = (props: React.PropsWithChildren<IWaterParkViewProps>) => {
    const [editable, setEditable] = React.useState(props.storage.componentList.size === 0);
    return (
        <>
            <ExternalComponentLoaderToolbarView
                componentUrls={ componentUrls }
                onSelectOption={ this.createAndAddComponent }
                toggleEditable={ () => setEditable(!editable) }
            />
            <SpacesStorageView storage={props.storage} editable={editable} />
        </>
    );
}
