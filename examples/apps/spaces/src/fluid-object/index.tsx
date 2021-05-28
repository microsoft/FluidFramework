/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { ReactElement } from "react";
import ReactDOM from "react-dom";
import { Layout } from "react-grid-layout";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidHandle,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";

import { RequestParser } from "@fluidframework/runtime-utils";
import { ISpacesStoredItem, SpacesStorage } from "./storage";
import { SpacesView } from "./spacesView";
import {
    spacesItemMap,
    spacesRegistryEntries,
    templateDefinitions,
} from "./spacesItemMap";

const SpacesStorageKey = "spaces-storage";

/**
 * ISpacesItem stores an itemType and a serializable object pairing.  Spaces maps this typename to its itemMap,
 * which lets it find how to get an item out of the serializable object.  The serializable object likely includes
 * one or more handles to persisted model components, though could include anything it wants.  So the Spaces component
 * owns the typenames, but the individual types own their own serializable object format.
 */
export interface ISpacesItem {
    /**
     * The unknown blob of data that backs the instance of the item.  Probably contains handles, etc.
     */
    serializableObject: Serializable;
    /**
     * A key matching an entry in the spacesItemMap, which we'll use to pair the unknown blob with an entry that
     * knows how to deal with it.
     */
    itemType: string;
}

/**
 * Spaces is the main component, which composes a SpacesToolbar with a SpacesStorage.
 */
export class Spaces extends DataObject implements IFluidHTMLView {
    private storageComponent: SpacesStorage | undefined;

    public static get ComponentName() { return "@fluid-example/spaces"; }

    private static readonly factory = new DataObjectFactory(
        Spaces.ComponentName,
        Spaces,
        [],
        {},
        [
            [SpacesStorage.ComponentName, Promise.resolve(SpacesStorage.getFactory())],
            ...spacesRegistryEntries,
        ],
    );

    public static getFactory() {
        return Spaces.factory;
    }

    public get IFluidHTMLView() { return this; }

    // In order to handle direct links to items, we'll link to the Spaces component with a path of the itemId for the
    // specific item we want.  We route through Spaces because it's the one with the registry, and so it's the one
    // that knows how to getViewForItem().
    public async request(req: IRequest): Promise<IResponse> {
        const requestParser = RequestParser.create({ url: req.url });
        // The only time we have a path will be direct links to items.
        if (requestParser.pathParts.length > 0) {
            const itemId = requestParser.pathParts[0];
            const item = this.storageComponent?.itemList.get(itemId);
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

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        const addItem = (type: string) => {
            this.createAndStoreItem(type, { w: 20, h: 5, x: 0, y: 0 })
                .catch((error) => {
                    console.error(`Error while creating item: ${type}`, error);
                });
        };

        const View: (props: any) => ReactElement = () => {
            if (this.storageComponent === undefined) {
                throw new Error("Spaces can't render, storage not found");
            }
            const [baseUrl, setBaseUrl] = React.useState<string | undefined>("");
            React.useEffect(() => {
                const getBaseUrl = async () => {
                    setBaseUrl(await this.context.getAbsoluteUrl(this.handle.absolutePath));
                };

                getBaseUrl().catch((error) => {
                    console.error(error);
                });
            });
            return (
                <SpacesView
                    itemMap={spacesItemMap}
                    storage={this.storageComponent}
                    addItem={addItem}
                    templates={[...Object.keys(templateDefinitions)]}
                    applyTemplate={this.applyTemplate}
                    getViewForItem={this.getViewForItem}
                    getUrlForItem={(itemId: string) => `#${baseUrl}/${itemId}`}
                />
            );
        };

        ReactDOM.render(
            <View />,
            div,
        );
    }

    protected async initializingFirstTime() {
        const storageComponent = await SpacesStorage.getFactory().createChildInstance(this.context);
        this.root.set(SpacesStorageKey, storageComponent.handle);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.setTemplate();
        }
    }

    protected async hasInitialized() {
        this.storageComponent =
            await this.root.get<IFluidHandle<SpacesStorage>>(SpacesStorageKey)?.get();
    }

    private readonly applyTemplate = async (template: string) => {
        const itemPromises: Promise<string>[] = [];
        const templateDefinition = templateDefinitions[template];
        for (const [itemType, layouts] of Object.entries(templateDefinition)) {
            for (const layout of layouts) {
                itemPromises.push(this.createAndStoreItem(itemType, layout));
            }
        }
        await Promise.all(itemPromises);
    };

    public saveLayout(): void {
        if (this.storageComponent === undefined) {
            throw new Error("Can't save layout, storage not found");
        }
        localStorage.setItem("spacesTemplate", JSON.stringify([...this.storageComponent.itemList.values()]));
    }

    public async setTemplate(): Promise<void> {
        const templateString = localStorage.getItem("spacesTemplate");
        if (templateString) {
            const templateItems = JSON.parse(templateString) as ISpacesStoredItem<ISpacesItem>[];
            const promises = templateItems.map(async (templateItem) => {
                return this.createAndStoreItem(templateItem.serializableItemData.itemType, templateItem.layout);
            });

            await Promise.all(promises);
        }
    }

    private async createAndStoreItem(type: string, layout: Layout): Promise<string> {
        if (this.storageComponent === undefined) {
            throw new Error("Can't add item, storage not found");
        }

        const itemMapEntry = spacesItemMap.get(type);
        if (itemMapEntry === undefined) {
            throw new Error("Unknown item, can't add");
        }

        const serializableObject = await itemMapEntry.create(this.context);
        return this.storageComponent.addItem(
            {
                serializableObject,
                itemType: type,
            },
            layout,
        );
    }

    private readonly getViewForItem = async (item: ISpacesItem) => {
        const registryEntry = spacesItemMap.get(item.itemType);

        if (registryEntry === undefined) {
            // Probably would be ok to return undefined instead
            throw new Error("Cannot get view, unknown widget type");
        }

        return registryEntry.getView(item.serializableObject);
    };
}
