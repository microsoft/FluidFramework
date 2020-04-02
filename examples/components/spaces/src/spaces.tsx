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
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IProvideComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { ISpacesDataModel, SpacesDataModel } from "./dataModel";
import { SpacesGridView } from "./view";
import { ComponentToolbar, ComponentToolbarName } from "./components";
import { IComponentToolbarConsumer, Templates } from "./interfaces";
import { InternalRegistry } from ".";

/**
 * Spaces is the Fluid
 */
export class Spaces extends PrimedComponent
    implements IComponentHTMLView, IProvideComponentCollection, IComponentToolbarConsumer {
    private dataModelInternal: ISpacesDataModel | undefined;
    private componentToolbar: IComponent | undefined;
    private static readonly defaultComponentToolbarId = "spaces-component-toolbar";
    private componentToolbarId = Spaces.defaultComponentToolbarId;

    // TODO #1188 - Component registry should automatically add ComponentToolbar
    // to the registry since it's required for the spaces component
    private static readonly factory = new PrimedComponentFactory(
        Spaces,
        [
            SharedObjectSequence.getFactory(),
        ],
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
    public get IComponentCollection() { return this.dataModel; }
    public get IComponentToolbarConsumer() { return this; }

    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        this.root.set("componentToolbarId", this.componentToolbarId);
        await this.initializeDataModel();
        this.componentToolbar =
            await this.dataModel.addComponent<ComponentToolbar>(
                ComponentToolbarName,
                4,
                4,
                0,
                0,
                Spaces.defaultComponentToolbarId,
            );
        (this.componentToolbar as ComponentToolbar).changeEditState(true);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModel.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.componentToolbarId = this.root.get("componentToolbarId");
        await this.initializeDataModel();
        this.componentToolbar = await this.dataModel.getComponentToolbar();
    }

    public async setComponentToolbar(id: string, type: string, url: string) {
        this.componentToolbarId = id;
        const componentToolbar = await this.dataModel.setComponentToolbar(id, type, url);
        this.componentToolbar = componentToolbar;
        this.root.set("componentToolbarId", id);
        this.addToolbarListeners();
    }

    protected async componentHasInitialized() {
        this.addToolbarListeners();
        const isEditable = this.dataModel.componentList.size - 1 === 0;
        this.dataModel.emit("editableUpdated", isEditable);
        if (this.root.get("componentToolbarId") === Spaces.defaultComponentToolbarId) {
            (this.componentToolbar as ComponentToolbar).changeEditState(isEditable);
        }
    }


    private addToolbarListeners() {
        if (this.componentToolbar && this.componentToolbar.IComponentCallable) {
            this.componentToolbar.IComponentCallable.setComponentCallbacks({
                addComponent: (type: string, w?: number, h?: number) => {
                    /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
                    this.dataModel.addComponent(type, w, h);
                },
                addTemplate: async (template: Templates) => {
                    const registry = await this.context.hostRuntime.IComponentRegistry.get("");
                    if (registry) {
                        const registryDetails = (registry as IComponent).IComponentRegistryDetails;
                        if (registryDetails) {
                            const componentRegistryEntries = (registryDetails as InternalRegistry)
                                .getFromTemplate(template);
                            // eslint-disable-next-line @typescript-eslint/no-misused-promises
                            componentRegistryEntries.forEach(async (componentRegistryEntry) => {
                                const templateLayouts: Layout[] = componentRegistryEntry.templates[template];
                                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                                templateLayouts.forEach(async (templateLayout: Layout) => {
                                    await this.dataModel.addComponent(
                                        componentRegistryEntry.type,
                                        templateLayout.w,
                                        templateLayout.h,
                                        templateLayout.x,
                                        templateLayout.y,
                                    );
                                });
                            });
                        }
                    }
                },
                saveLayout: () => this.dataModel.saveLayout(),
                toggleEditable: (isEditable?: boolean) =>  this.dataModel.emit("editableUpdated", isEditable),
            });
        }
    }

    private async initializeDataModel() {
        this.dataModelInternal =
            new SpacesDataModel(
                this.root,
                this.createAndAttachComponent.bind(this),
                this.getComponent.bind(this),
                this.componentToolbarId,
            );
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <SpacesGridView dataModel={this.dataModel}/>,
            div);
    }
}
