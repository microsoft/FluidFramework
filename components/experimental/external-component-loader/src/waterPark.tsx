/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidHandle,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IPackage } from "@fluidframework/container-definitions";
import { ReactViewAdapter } from "@fluidframework/view-adapters";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import {
    SpacesStorage,
    SpacesStorageView,
} from "@fluid-example/spaces";
import React from "react";
import ReactDOM from "react-dom";
import { RequestParser } from "@fluidframework/runtime-utils";
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
 * IWaterparkItem just stores a handle, and will assume that the handle points to something that a ReactViewAdapter
 * can adapt for rendering purposes.
 */
export interface IWaterparkItem {
    handle: IFluidHandle;
}

/**
 * WaterPark assembles the SpacesStorage with the ExternalComponentLoader to load other components.
 */
export class WaterPark extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    public static get ComponentName() { return "@fluid-example/waterpark"; }

    private static readonly factory = new DataObjectFactory(
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

    private storage: SpacesStorage<IWaterparkItem> | undefined;
    private loader: ExternalComponentLoader | undefined;
    private baseUrl: string | undefined;

    public render(element: HTMLElement) {
        if (this.storage === undefined) {
            throw new Error("Can't render, storage not found");
        }
        ReactDOM.render(
            <WaterParkView
                storage={this.storage}
                onSelectOption={this.addComponent}
                getViewForItem={this.getViewForItem}
                getUrlForItem={(itemId: string) => `${this.baseUrl}/${itemId}`}
            />,
            element,
        );
    }

    // In order to handle direct links to items, we'll link to the Waterpark component with a path of the itemId for
    // the specific item we want.  We route through Waterpark because it knows how to get a view out of an
    // IWaterparkItem.
    public async request(req: IRequest): Promise<IResponse> {
        const requestParser = new RequestParser({ url: req.url });
        // The only time we have a path will be direct links to items.
        if (requestParser.pathParts.length > 0) {
            const itemId = requestParser.pathParts[0];
            const item = this.storage?.itemList.get(itemId);
            if (item !== undefined) {
                const viewForItem = await this.getViewForItem(item.serializableItemData);
                return {
                    mimeType: "fluid/view",
                    status: 200,
                    value: viewForItem,
                };
            }
        }

        // If it's not a direct link to an item, then just do normal request handling.
        return super.request(req);
    }

    protected async initializingFirstTime() {
        const storage = await this.createAndAttachDataStore(SpacesStorage.ComponentName);
        this.root.set(storageKey, storage.handle);
        const loader = await this.createAndAttachDataStore(ExternalComponentLoader.ComponentName);
        this.root.set(loaderKey, loader.handle);
    }

    protected async hasInitialized() {
        this.storage = await this.root.get<IFluidHandle<SpacesStorage<IWaterparkItem>>>(storageKey)?.get();
        this.loader = await this.root.get<IFluidHandle<ExternalComponentLoader>>(loaderKey)?.get();
        // We'll cache this async result on initialization, since we need it synchronously during render.
        this.baseUrl = await this.context.getAbsoluteUrl(this.url);
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
        this.storage.addItem({
            handle: component.handle,
        });
    };

    private readonly getViewForItem = async (item: IWaterparkItem) => {
        const component = await item.handle.get();

        // This is where Spaces would do a lookup for how to get the view and call that.
        // In Waterpark, we'll just assume the handle points to something we can adapt with a ReactViewAdapter.
        if (ReactViewAdapter.canAdapt(component)) {
            return <ReactViewAdapter view={component} />;
        }

        return undefined;
    };
}

interface IWaterParkViewProps {
    storage: SpacesStorage<IWaterparkItem>;
    onSelectOption: (componentUrl: string) => Promise<void>;
    getViewForItem: (item: IWaterparkItem) => Promise<JSX.Element | undefined>;
    getUrlForItem: (itemId: string) => string;
}

export const WaterParkView: React.FC<IWaterParkViewProps> = (props: React.PropsWithChildren<IWaterParkViewProps>) => {
    const [editable, setEditable] = React.useState(props.storage.itemList.size === 0);
    return (
        <>
            <WaterParkToolbar
                componentUrls={componentUrls}
                onSelectOption={props.onSelectOption}
                toggleEditable={() => setEditable(!editable)}
            />
            <SpacesStorageView
                getViewForItem={props.getViewForItem}
                getUrlForItem={props.getUrlForItem}
                storage={props.storage}
                editable={editable}
            />
        </>
    );
};
