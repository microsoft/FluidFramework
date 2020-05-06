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
} from "@microsoft/fluid-component-core-interfaces";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { ISpacesDataModel, ISpacesModel, SpacesDataModel } from "./dataModel";
import { SpacesView } from "./view";
import { ComponentToolbar, ComponentToolbarName } from "./components";
import {
    IComponentToolbarConsumer,
    IProvideComponentCollectorSpaces,
    SpacesCompatibleToolbar,
} from "./interfaces";
import { SpacesComponentName, Templates } from ".";

/**
 * Spaces is a component which maintains a collection of other components and a grid-based layout for rendering.
 */
export class Spaces extends PrimedComponent implements
    IComponentHTMLView,
    IComponentToolbarConsumer,
    IProvideComponentCollectorSpaces
{
    private dataModelInternal: ISpacesDataModel | undefined;
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
        [[ ComponentToolbarName, Promise.resolve(ComponentToolbar.getFactory()) ]],
    );

    public static getFactory() {
        return Spaces.factory;
    }

    private get dataModel(): ISpacesDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Spaces DataModel was not properly initialized.");
        }
        return this.dataModelInternal;
    }

    public get IComponentHTMLView() { return this; }
    public get IComponentCollectorSpaces() { return this.dataModel; }
    public get IComponentToolbarConsumer() { return this; }

    public setComponentToolbar(id: string, type: string, toolbarComponent: SpacesCompatibleToolbar) {
        this.dataModel.setComponentToolbar(id, type, toolbarComponent);
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        const toolbarCallbacks = {
            addComponent: (type: string, w?: number, h?: number) => {
                this.createAndAttachComponent(type)
                    .then((component) => {
                        this.dataModel.addComponent(component, type, { w, h, x: 0, y: 0 });
                    })
                    .catch((error) => {
                        console.error(`Error while creating component: ${type}`, error);
                    });
            },
            shouldShowTemplates: () => this.registryDetails?.IComponentRegistryTemplates !== undefined,
            addTemplate: this.addTemplateFromRegistry.bind(this),
            saveLayout: () => this.saveLayout(),
        };
        ReactDOM.render(<SpacesView dataModel={this.dataModel} toolbarCallbacks={ toolbarCallbacks } />, div);
    }

    protected async componentInitializingFirstTime() {
        this.root.createSubDirectory("component-list");
        this.initializeDataModel();
        const componentToolbar = await this.createAndAttachComponent<ComponentToolbar>(ComponentToolbarName);
        this.setComponentToolbar(
            componentToolbar.url,
            ComponentToolbarName,
            componentToolbar);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.initializeDataModel();
    }

    protected async componentHasInitialized() {
        this.registryDetails = await this.context.containerRuntime.IComponentRegistry.get("");
    }

    private initializeDataModel() {
        this.dataModelInternal = new SpacesDataModel(this.root);
    }

    private async addTemplateFromRegistry(template: Templates) {
        if (this.registryDetails?.IComponentRegistryTemplates !== undefined) {
            const componentRegistryEntries = this.registryDetails.IComponentRegistryTemplates
                .getFromTemplate(template);
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            componentRegistryEntries.forEach(async (componentRegistryEntry) => {
                const templateLayouts: Layout[] = componentRegistryEntry.templates[template];
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                templateLayouts.forEach(async (templateLayout: Layout) => {
                    const component = await this.createAndAttachComponent(componentRegistryEntry.type);
                    this.dataModel.addComponent(component, componentRegistryEntry.type, templateLayout);
                });
            });
        }
    }

    public saveLayout(): void {
        localStorage.setItem("spacesTemplate", JSON.stringify(this.dataModel.getModels()));
    }

    public async setTemplate(): Promise<void> {
        if (this.dataModel.componentList.size > 0) {
            console.log("Can't set template because there is already components");
            return;
        }

        const templateString = localStorage.getItem("spacesTemplate");
        if (templateString) {
            const templateItems = JSON.parse(templateString) as ISpacesModel[];
            const promises = templateItems.map(async (templateItem) => {
                const component = await this.createAndAttachComponent(templateItem.type);
                this.dataModel.addComponent(component, templateItem.type, templateItem.layout);
                return component;
            });

            await Promise.all(promises);
        }
    }
}
