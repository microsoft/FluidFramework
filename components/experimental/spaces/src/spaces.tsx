/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Layout } from "react-grid-layout";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { IDirectoryValueChanged } from "@microsoft/fluid-map";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { SpacesToolbar, SpacesToolbarName } from "./spacesToolbar";
import { SpacesView } from "./view";
import {
    IComponentToolbarConsumer,
    SpacesCompatibleToolbar,
} from "./interfaces";
import { SpacesComponentName, Templates } from ".";

const ComponentToolbarKey = "component-toolbar";

export interface ISpacesModel extends EventEmitter {
    readonly componentList: Map<string, ISpacesStoredComponent>;
    /**
     * Adds the given item to the collector.
     * @param item - The item to add.
     * @returns A unique key corresponding to the added item.
     */
    addItem(item: ISpacesCollectible): string;
    /**
     * Removes the item specified by the given key.
     * @param key - The key referring to the item to remove.
     */
    removeItem(key: string): void;
    updateLayout(key: string, newLayout: Layout): void;
}

export interface ISpacesStoredComponent {
    type: string;
    layout: Layout;
    handle: IComponentHandle;
}

/**
 * Spaces collects loadable components paired with a type.  The type is actually not generally needed except for
 * supporting export to template.
 */
export interface ISpacesCollectible {
    component: IComponent & IComponentLoadable;
    type: string;
    layout?: Layout;
}

/**
 * Spaces is a component which maintains a collection of other components and a grid-based layout for rendering.
 */
export class Spaces extends PrimedComponent implements
    IComponentHTMLView,
    IComponentToolbarConsumer,
    ISpacesModel
{
    private registryDetails: IComponent | undefined;

    // TODO #1188 - Component registry should automatically add ComponentToolbar
    // to the registry since it's required for the spaces component
    private static readonly factory = new PrimedComponentFactory(
        SpacesComponentName,
        Spaces,
        [
            SharedObjectSequence.getFactory(),
        ],
        {},
        [[ SpacesToolbarName, Promise.resolve(SpacesToolbar.getFactory()) ]],
    );

    public static getFactory() {
        return Spaces.factory;
    }

    private get componentSubDirectory() {
        return this.root.getSubDirectory("component-list");
    }

    public get IComponentHTMLView() { return this; }
    public get IComponentToolbarConsumer() { return this; }

    public setToolbarComponent(toolbarComponent: SpacesCompatibleToolbar): void {
        if (toolbarComponent.handle === undefined) {
            throw new Error(`Toolbar component must have a handle.`);
        }
        this.root.set(ComponentToolbarKey, toolbarComponent.handle);
    }

    public async getToolbarComponent(): Promise<SpacesCompatibleToolbar | undefined> {
        return this.root.get<IComponentHandle<SpacesCompatibleToolbar> | undefined>(ComponentToolbarKey)?.get();
    }

    public get componentList(): Map<string, ISpacesStoredComponent> {
        return this.componentSubDirectory;
    }

    public addItem(item: ISpacesCollectible): string {
        if (item.component.handle === undefined) {
            throw new Error(`Component must have a handle: ${item.type}`);
        }
        const model: ISpacesStoredComponent = {
            type: item.type,
            layout: item.layout ?? { x: 0, y: 0, w: 6, h: 2 },
            handle: item.component.handle,
        };
        this.componentSubDirectory.set(item.component.url, model);
        return item.component.url;
    }

    public removeItem(key: string): void {
        this.componentSubDirectory.delete(key);
    }

    public updateLayout(key: string, newLayout: Layout): void {
        const currentEntry = this.componentSubDirectory.get<ISpacesStoredComponent>(key);
        const model = {
            type: currentEntry.type,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
            handle: currentEntry.handle,
        };
        this.componentSubDirectory.set(key, model);
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        const toolbarProps = {
            addComponent: (type: string) => {
                this.createAndAttachComponent(type)
                    .then((component) => {
                        this.addItem({
                            component,
                            type,
                            layout: { w: 20, h: 5, x: 0, y: 0 },
                        });
                    })
                    .catch((error) => {
                        console.error(`Error while creating component: ${type}`, error);
                    });
            },
            addItem: (item: ISpacesCollectible) => { return this.addItem(item); },
            templatesAvailable: this.registryDetails?.IComponentRegistryTemplates !== undefined,
            addTemplate: this.addTemplateFromRegistry.bind(this),
            saveLayout: () => this.saveLayout(),
        };
        ReactDOM.render(
            <SpacesView
                toolbarComponentP={ this.getToolbarComponent() }
                dataModel={ this }
                toolbarProps={ toolbarProps }
            />,
            div,
        );
    }

    protected async componentInitializingFirstTime() {
        this.root.createSubDirectory("component-list");
        const toolbarComponent = await this.createAndAttachComponent<SpacesToolbar>(SpacesToolbarName);
        this.setToolbarComponent(toolbarComponent);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.setTemplate();
        }
    }

    protected async componentHasInitialized() {
        this.registryDetails = await this.context.containerRuntime.IComponentRegistry.get("");
        this.root.on("valueChanged", (changed: IDirectoryValueChanged, local: boolean) => {
            // If we don't have this then moving locally is broken
            if (changed.path === this.componentSubDirectory.absolutePath) {
                this.emit("componentListChanged", new Map(this.componentList.entries()));
            }
        });
    }

    private async addTemplateFromRegistry(template: Templates) {
        if (this.registryDetails?.IComponentRegistryTemplates !== undefined) {
            const componentRegistryEntries = this.registryDetails.IComponentRegistryTemplates
                .getFromTemplate(template);
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            componentRegistryEntries.forEach(async (componentRegistryEntry) => {
                const templateLayouts: Layout[] = componentRegistryEntry.templates[template];
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                templateLayouts.forEach(async (layout: Layout) => {
                    const component = await this.createAndAttachComponent(componentRegistryEntry.type);
                    this.addItem({
                        component,
                        type: componentRegistryEntry.type,
                        layout,
                    });
                });
            });
        }
    }

    public saveLayout(): void {
        localStorage.setItem("spacesTemplate", JSON.stringify([...this.componentSubDirectory.values()]));
    }

    public async setTemplate(): Promise<void> {
        if (this.componentSubDirectory.size > 0) {
            console.log("Can't set template because there is already components");
            return;
        }

        const templateString = localStorage.getItem("spacesTemplate");
        if (templateString) {
            const templateItems = JSON.parse(templateString) as ISpacesStoredComponent[];
            const promises = templateItems.map(async (templateItem) => {
                const component = await this.createAndAttachComponent(templateItem.type);
                this.addItem({
                    component,
                    type: templateItem.type,
                    layout: templateItem.layout,
                });
                return component;
            });

            await Promise.all(promises);
        }
    }
}
