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
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import { ISpacesStoredComponent, SpacesStorage } from "./storage";
import { SpacesView } from "./spacesView";
import {
    spacesComponentMap,
    spacesRegistryEntries,
    templateDefinitions,
} from "./spacesComponentMap";

const SpacesStorageKey = "spaces-storage";

/**
 * Spaces is the main component, which composes a SpacesToolbar with a SpacesStorage.
 */
export class Spaces extends PrimedComponent implements IComponentHTMLView {
    private storageComponent: SpacesStorage | undefined;

    public static get ComponentName() { return "@fluid-example/spaces"; }

    private static readonly factory = new PrimedComponentFactory(
        Spaces.ComponentName,
        Spaces,
        [],
        {},
        [
            [ SpacesStorage.ComponentName, Promise.resolve(SpacesStorage.getFactory()) ],
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
                storage={ this.storageComponent }
                addComponent={ addComponent }
                templates={ [...Object.keys(templateDefinitions)] }
                applyTemplate={ this.applyTemplate }
            />,
            div,
        );
    }

    protected async componentInitializingFirstTime() {
        const storageComponent = await this.createAndAttachComponent<SpacesStorage>(SpacesStorage.ComponentName);
        this.root.set(SpacesStorageKey, storageComponent.handle);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.setTemplate();
        }
    }

    protected async componentHasInitialized() {
        this.storageComponent = await this.root.get<IComponentHandle<SpacesStorage>>(SpacesStorageKey)?.get();
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
        localStorage.setItem("spacesTemplate", JSON.stringify([...this.storageComponent.componentList.values()]));
    }

    public async setTemplate(): Promise<void> {
        const templateString = localStorage.getItem("spacesTemplate");
        if (templateString) {
            const templateItems = JSON.parse(templateString) as ISpacesStoredComponent[];
            const promises = templateItems.map(async (templateItem) => {
                return this.createAndStoreComponent(templateItem.type, templateItem.layout);
            });

            await Promise.all(promises);
        }
    }

    private async createAndStoreComponent(type: string, layout: Layout): Promise<string> {
        const component = await this.createAndAttachComponent(type);

        if (component.handle === undefined) {
            throw new Error("Can't add, component must have a handle");
        }

        if (this.storageComponent === undefined) {
            throw new Error("Can't add item, storage not found");
        }

        return this.storageComponent.addItem(
            component.handle,
            type,
            layout,
        );
    }
}
