/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IPackage } from "@microsoft/fluid-container-definitions";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import {
    SpacesStorage,
    SpacesStorageView,
} from "@fluid-example/spaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { WaterParkToolbar } from "./waterParkToolbar";
import { ExternalComponentLoader } from "./externalComponentLoader";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("../package.json") as IPackage;

const storageKey = "storage";
const loaderKey = "loader";

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
 * WaterPark assembles the SpacesStorage with a custom toolbar that can load other components
 */
export class WaterPark extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    public static get ComponentName() { return "@fluid-example/waterpark"; }

    private static readonly factory = new PrimedComponentFactory(
        WaterPark.ComponentName,
        WaterPark,
        [],
        {},
        [
            [SpacesStorage.ComponentName, Promise.resolve(SpacesStorage.getFactory())],
            [ExternalComponentLoader.ComponentName, Promise.resolve(ExternalComponentLoader.getFactory())],
        ],
    );

    public static getFactory() {
        return WaterPark.factory;
    }

    private storage: SpacesStorage | undefined;
    private loader: ExternalComponentLoader | undefined;

    public render(element: HTMLElement) {
        if (this.storage === undefined) {
            throw new Error("Can't render, storage not found");
        }
        ReactDOM.render(
            <WaterParkView storage={this.storage} onSelectOption={this.addComponent} />,
            element,
        );
    }

    protected async componentInitializingFirstTime() {
        const storage = await this.createAndAttachComponent(SpacesStorage.ComponentName);
        this.root.set(storageKey, storage.handle);
        const loader = await this.createAndAttachComponent(ExternalComponentLoader.ComponentName);
        this.root.set(loaderKey, loader.handle);
    }

    protected async componentHasInitialized() {
        this.storage = await this.root.get<IComponentHandle<SpacesStorage>>(storageKey)?.get();
        this.loader = await this.root.get<IComponentHandle<ExternalComponentLoader>>(loaderKey)?.get();
    }

    private readonly addComponent = async (componentUrl: string) => {
        if (this.loader === undefined) {
            throw new Error("Can't add component, loader not found");
        }
        if (this.storage === undefined) {
            throw new Error("Can't add component, storage not found");
        }

        const component = await this.loader.createComponentFromUrl(componentUrl);
        this.storage.addItem({
            component,
            type: componentUrl,
        });
    };
}

interface IWaterParkViewProps {
    storage: SpacesStorage;
    onSelectOption: (componentUrl: string) => Promise<void>;
}

export const WaterParkView: React.FC<IWaterParkViewProps> = (props: React.PropsWithChildren<IWaterParkViewProps>) => {
    const [editable, setEditable] = React.useState(props.storage.componentList.size === 0);
    return (
        <>
            <WaterParkToolbar
                componentUrls={ componentUrls }
                onSelectOption={ props.onSelectOption }
                toggleEditable={ () => setEditable(!editable) }
            />
            <SpacesStorageView storage={props.storage} editable={editable} />
        </>
    );
};
