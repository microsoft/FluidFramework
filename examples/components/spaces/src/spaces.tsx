/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IProvideComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { ISpacesDataModel, SpacesDataModel } from "./dataModel";
import { SpacesGridView } from "./view";
import { ComponentToolbar, ComponentToolbarName } from "./components";
import { IComponentToolbarConsumer } from "./interfaces";
import { SpacesComponentName } from "./index";

/**
 * Spaces is the Fluid
 */
export class Spaces extends PrimedComponent
    implements IComponentHTMLView, IProvideComponentCollection, IComponentToolbarConsumer {
    private dataModelInternal: ISpacesDataModel | undefined;
    private componentToolbar: IComponent | undefined;
    private static readonly defaultComponentToolbarId = "spaces-component-toolbar";
    private componentToolbarId: string = Spaces.defaultComponentToolbarId;

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
    public get IComponentCollection() { return this.dataModel; }
    public get IComponentToolbarConsumer() { return this; }

    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        this.initializeDataModel();
        const componentToolbar =
            await this.dataModel.addComponent<ComponentToolbar>(
                ComponentToolbarName,
                4,
                4,
                Spaces.defaultComponentToolbarId,
            );
        this.componentToolbar = componentToolbar;
        await this.dataModel.setComponentToolbar(
            Spaces.defaultComponentToolbarId,
            ComponentToolbarName,
            componentToolbar.handle);
        (this.componentToolbar as ComponentToolbar).changeEditState(true);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModel.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.componentToolbarId = this.root.get("component-toolbar-id");
        this.initializeDataModel();
        this.componentToolbar = await this.dataModel.getComponent<ComponentToolbar>(this.componentToolbarId);
    }

    protected async componentHasInitialized() {
        this.addToolbarListeners();
        const isEditable = this.dataModel.componentList.size - 1 === 0;
        this.dataModel.emit("editableUpdated", isEditable);
        if (this.root.get("component-toolbar-id") === Spaces.defaultComponentToolbarId) {
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
                saveLayout: () => this.dataModel.saveLayout(),
                toggleEditable: (isEditable?: boolean) =>  this.dataModel.emit("editableUpdated", isEditable),
            });
        }
    }

    private initializeDataModel() {
        this.dataModelInternal =
            new SpacesDataModel(
                this.root,
                this.createAndAttachComponent.bind(this),
                this.getComponentFromDirectory.bind(this),
                this.componentToolbarId,
            );
    }

    public async setComponentToolbar(id: string, type: string, handle: IComponentHandle) {
        this.componentToolbarId = id;
        const componentToolbar = await this.dataModel.setComponentToolbar(id, type, handle);
        this.componentToolbar = componentToolbar;
        this.addToolbarListeners();
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
