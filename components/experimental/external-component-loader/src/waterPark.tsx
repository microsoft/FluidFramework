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
    FluidComponentMap,
    useReducerFluid,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "@microsoft/fluid-aqueduct-react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import {
    SpacesStorageView,
} from "@fluid-example/spaces-view";
import {
    SpacesReducer,
    SpacesSelector,
    SpacesPrimedContext,
} from "@fluid-example/spaces-data";
import {
    ISpacesDataProps,
} from "@fluid-example/spaces-definitions";
import {
    ComponentStorage,
} from "@fluid-example/component-storage";
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

/**
 * localComponentUrls facilitates local component development.  Make sure the path points to a directory containing
 * the package.json for the package, and also make sure you've run webpack there first.  These will only be
 * available when running on localhost.
 */
const localComponentUrls = [
    // "http://localhost:8080/file/C:\\git\\FluidFramework\\components\\experimental\\todo",
    // "http://localhost:8080/file/C:\\git\\FluidFramework\\components\\experimental\\clicker",
];

// When locally developing, want to load the latest available patch version by default
const defaultVersionToLoad = pkg.version.endsWith(".0") ? `^${pkg.version}` : pkg.version;
const componentUrls = defaultComponents.map((url) => `${url}@${defaultVersionToLoad}`);

// When running on localhost, add entries for local component development.
if (window.location.hostname === "localhost") {
    componentUrls.push(...localComponentUrls);
}

/**
 * WaterPark assembles the ComponentStorage with the ExternalComponentLoader to load other components.
 */
export class WaterPark extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }
    private fluidComponentMap: FluidComponentMap | undefined;

    public static get ComponentName() { return "@fluid-example/waterpark"; }

    private static readonly factory = new PrimedComponentFactory(
        WaterPark.ComponentName,
        WaterPark,
        [],
        {},
        [
            [ComponentStorage.ComponentName, Promise.resolve(ComponentStorage.getFactory())],
            [ExternalComponentLoader.ComponentName, Promise.resolve(ExternalComponentLoader.getFactory())],
        ],
    );

    public static getFactory() {
        return WaterPark.factory;
    }

    private storage: ComponentStorage | undefined;
    private loader: ExternalComponentLoader | undefined;

    public render(element: HTMLElement) {
        if (this.storage === undefined || this.fluidComponentMap === undefined) {
            throw new Error("Can't render, storage not found");
        }
        ReactDOM.render(
            <WaterParkView
                root={this.root}
                runtime={this.runtime}
                fluidComponentMap={this.fluidComponentMap}
                storage={this.storage}
                onSelectOption={this.addComponent} />,
            element,
        );
    }

    protected async componentInitializingFirstTime() {
        const storage = await this.createAndAttachComponent(ComponentStorage.ComponentName);
        this.root.set(storageKey, storage.handle);
        const loader = await this.createAndAttachComponent(ExternalComponentLoader.ComponentName);
        this.root.set(loaderKey, loader.handle);
        this.fluidComponentMap = new Map();
        if (storage !== undefined && storage.handle !== undefined) {
            this.fluidComponentMap.set(storage.handle.path, { component: storage });
        }
    }

    protected async componentHasInitialized() {
        this.storage = await this.root.get<IComponentHandle<ComponentStorage>>(storageKey)?.get();
        this.loader = await this.root.get<IComponentHandle<ExternalComponentLoader>>(loaderKey)?.get();
        this.fluidComponentMap = new Map();
        if (this.storage !== undefined && this.storage.handle !== undefined) {
            this.fluidComponentMap.set(this.storage.handle.path, { component: this.storage });
            const fetchInitialComponentP: Promise<void>[] = [];
            this.storage.componentList.forEach((value, key) => {
                const fetchComponentP = value.handle.get().then((component) => {
                    if (component.handle !== undefined) {
                        this.fluidComponentMap?.set(component.handle.path, { component });
                    }
                });
                fetchInitialComponentP.push(fetchComponentP);
                return;
            });
            await Promise.all(fetchInitialComponentP);
        }
    }

    /**
     * addComponent is handed down to the WaterParkToolbar as the callback when an option is selected from the list.
     */
    private readonly addComponent = async (componentUrl: string) => {
        if (this.loader === undefined) {
            throw new Error("Can't add component, loader not found");
        }
        if (this.storage === undefined) {
            throw new Error("Can't add component, storage not found");
        }

        const component = await this.loader.createComponentFromUrl(componentUrl);
        if (component.handle === undefined) {
            throw new Error("Can't add, component must have a handle");
        }
        this.storage.addItem(
            component.handle,
            componentUrl,
        );
    };
}

interface IWaterParkViewProps {
    runtime: IComponentRuntime,
    root: ISharedDirectory,
    storage: ComponentStorage;
    fluidComponentMap: FluidComponentMap,
    onSelectOption: (componentUrl: string) => Promise<void>;
}

export const WaterParkView: React.FC<IWaterParkViewProps> = (props: React.PropsWithChildren<IWaterParkViewProps>) => {
    const { root, storage, runtime, fluidComponentMap } = props;
    const [editable, setEditable] = React.useState(storage.componentList.size === 0);
    const initialViewState: IFluidFunctionalComponentViewState = {};
    const initialFluidState: IFluidFunctionalComponentFluidState = {};
    const dataProps: ISpacesDataProps = {
        runtime,
        fluidComponentMap,
        syncedStorage: storage,
    };
    const reducerProps = {
        syncedStateId: "waterpark-reducer",
        root,
        initialViewState,
        initialFluidState,
        reducer: SpacesReducer,
        selector: SpacesSelector,
        fluidToView: new Map(),
        viewToFluid: new Map(),
        dataProps,
    };
    const [state, reducer, selector] = useReducerFluid(reducerProps);
    return (
        <SpacesPrimedContext.Provider
            value={{
                reducer,
                selector,
                state,
            }}
        >
            <WaterParkToolbar
                componentUrls={ componentUrls }
                onSelectOption={ props.onSelectOption }
                toggleEditable={ () => setEditable(!editable) }
            />
            <SpacesStorageView editable={editable} />
        </SpacesPrimedContext.Provider>
    );
};
