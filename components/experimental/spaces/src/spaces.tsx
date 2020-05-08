/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { SpacesStorage } from "./spacesStorage";
import { SpacesToolbar } from "./spacesToolbar";
import { SpacesView } from "./view";
import {
    IComponentSpacesToolbarProps,
    SpacesCompatibleToolbar,
} from "./interfaces";
import { InternalRegistry, SpacesComponentName, Templates } from ".";

const SpacesStorageKey = "spaces-storage";

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
 * Spaces is the app, which uses the toolbar and the storage to present a unified experience..
 */
export class Spaces extends PrimedComponent implements IComponentHTMLView {
    private storageComponent: SpacesStorage | undefined;
    private toolbarComponent: SpacesCompatibleToolbar | undefined;
    private registryDetails: IComponent | undefined;

    // TODO #1188 - Component registry should automatically add ComponentToolbar
    // to the registry since it's required for the spaces component
    private static readonly factory = new PrimedComponentFactory(
        SpacesComponentName,
        Spaces,
        [],
        {},
        [
            [ SpacesStorage.ComponentName, Promise.resolve(SpacesStorage.getFactory()) ],
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
            throw new Error("Temporarily throwing -- should eventually make SpacesView robust to no storageComponent");
        }
        const toolbarProps: IComponentSpacesToolbarProps = {
            addComponent: (type: string) => {
                this.createAndAttachComponent(type)
                    .then((component) => {
                        this.storageComponent?.addItem({
                            component,
                            type,
                            layout: { w: 20, h: 5, x: 0, y: 0 },
                        });
                    })
                    .catch((error) => {
                        console.error(`Error while creating component: ${type}`, error);
                    });
            },
            addItem: (item: ISpacesCollectible) => {
                if (this.storageComponent === undefined) {
                    throw new Error("Can't addItem, storage not found");
                }
                return this.storageComponent.addItem(item);
            },
            templatesAvailable: () => this.registryDetails?.IComponentRegistryTemplates !== undefined,
            addTemplate: this.addTemplateFromRegistry.bind(this),
            saveLayout: () => this.saveLayout(),
        };
        ReactDOM.render(
            <SpacesView
                toolbarComponent={ this.toolbarComponent }
                dataModel={ this.storageComponent }
                toolbarProps={ toolbarProps }
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
        this.registryDetails = await this.context.containerRuntime.IComponentRegistry.get("");

        let components;
        if (this.registryDetails) {
            const registryDetails = this.registryDetails.IComponentRegistryDetails;
            if (registryDetails) {
                components = (registryDetails as InternalRegistry)
                    .getFromCapability("IComponentHTMLView");
            }
        }
        this.toolbarComponent = new SpacesToolbar(components ?? []);
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
                    this.storageComponent?.addItem({
                        component,
                        type: componentRegistryEntry.type,
                        layout,
                    });
                });
            });
        }
    }

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
                const component = await this.createAndAttachComponent(templateItem.type);
                this.storageComponent?.addItem({
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
