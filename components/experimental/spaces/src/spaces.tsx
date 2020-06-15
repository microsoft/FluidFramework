/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { Layout } from "react-grid-layout";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IComponentHandle,
} from "@fluidframework/component-core-interfaces";
import { AsSerializable } from "@fluidframework/component-runtime-definitions";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import { ISpacesStoredItem, SpacesStorage } from "./storage";
import { SpacesView } from "./spacesView";
import {
    spacesComponentMap,
    spacesRegistryEntries,
    templateDefinitions,
} from "./spacesComponentMap";

const SpacesStorageKey = "spaces-storage";

/**
 * ISpacesItem stores an itemType and a serializable object pairing.  Spaces maps this typename to its itemMap,
 * which lets it find how to get an item out of the serializable object.  The serializable object likely includes
 * one or more handles to persisted model components, though could include anything it wants.  So the Spaces component
 * owns the typenames, but the individual types own their own serializable object format.
 */
export interface ISpacesItem {
    serializableObject: AsSerializable<any>;
    itemType: string;
}

/**
 * Spaces is the main component, which composes a SpacesToolbar with a SpacesStorage.
 */
export class Spaces extends PrimedComponent implements IComponentHTMLView {
    private storageComponent: SpacesStorage<ISpacesItem> | undefined;

    public static get ComponentName() { return "@fluid-example/spaces"; }

    private static readonly factory = new PrimedComponentFactory(
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

    public get IComponentHTMLView() { return this; }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        if (this.storageComponent === undefined) {
            throw new Error("Spaces can't render, storage not found");
        }

        const addComponent = (type: string) => {
            this.createAndStoreComponent(type, { w: 20, h: 5, x: 0, y: 0 })
                .catch((error) => {
                    console.error(`Error while creating component: ${type}`, error);
                });
        };

        ReactDOM.render(
            <SpacesView
                componentMap={spacesComponentMap}
                storage={this.storageComponent}
                addComponent={addComponent}
                templates={[...Object.keys(templateDefinitions)]}
                applyTemplate={this.applyTemplate}
                getViewForItem={this.getViewForItem}
            />,
            div,
        );
    }

    protected async componentInitializingFirstTime() {
        const storageComponent =
            await this.createAndAttachComponent<SpacesStorage<ISpacesItem>>(SpacesStorage.ComponentName);
        this.root.set(SpacesStorageKey, storageComponent.handle);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.setTemplate();
        }
    }

    protected async componentHasInitialized() {
        this.storageComponent =
            await this.root.get<IComponentHandle<SpacesStorage<ISpacesItem>>>(SpacesStorageKey)?.get();
    }

    private readonly applyTemplate = async (template: string) => {
        const componentPromises: Promise<string>[] = [];
        const templateDefinition = templateDefinitions[template];
        for (const [componentType, layouts] of Object.entries(templateDefinition)) {
            for (const layout of layouts) {
                componentPromises.push(this.createAndStoreComponent(componentType, layout));
            }
        }
        await Promise.all(componentPromises);
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
                return this.createAndStoreComponent(templateItem.serializableItemData.itemType, templateItem.layout);
            });

            await Promise.all(promises);
        }
    }

    private async createAndStoreComponent(type: string, layout: Layout): Promise<string> {
        if (this.storageComponent === undefined) {
            throw new Error("Can't add item, storage not found");
        }

        const componentMapEntry = spacesComponentMap.get(type);
        if (componentMapEntry === undefined) {
            throw new Error("Unknown component, can't add");
        }

        // Don't really want to hand out createAndAttachComponent here.
        const serializableObject = await componentMapEntry.create(this.createAndAttachComponent.bind(this));
        return this.storageComponent.addItem(
            {
                serializableObject,
                itemType: type,
            },
            layout,
        );
    }

    private readonly getViewForItem = async (item: ISpacesItem) => {
        const registryEntry = spacesComponentMap.get(item.itemType);

        if (registryEntry === undefined) {
            // Probably would be ok to return undefined instead?
            throw new Error("Cannot get view, unknown widget type");
        }

        return registryEntry.getView(item.serializableObject);
    };
}
