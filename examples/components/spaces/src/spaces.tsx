/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLView,
    IComponent,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IProvideComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { ISpacesDataModel, SpacesDataModel } from "./dataModel";

import { SpacesGridView } from "./view";
import { ComponentToolbar, ComponentToolbarName } from "./components";
import { IComponentToolbarConsumer } from "./interfaces";

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

    public async asComponent<T extends IComponent>(response: Promise<IResponse>): Promise<T> {
        return super.asComponent<T>(response);
    }

    /**
     * Gets the component of a given id. Will follow the pattern of the container for waiting.
     * @param id - component id
     */
    protected async getComponent_UNSAFE<T extends IComponent>(id: string, wait: boolean = true): Promise<T> {
        const request = {
            headers: [[wait]],
            url: `/${id}`,
        };

        return this.asComponent<T>(this.context.hostRuntime.request(request));
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
        this.root.set("component-toolbar", componentToolbar.handle);
        this.componentToolbar = componentToolbar;
        (this.componentToolbar as ComponentToolbar).changeEditState(true);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModel.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.initializeDataModel();
        this.componentToolbar = await this.dataModel.getComponent<ComponentToolbar>(this.componentToolbarId);
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
                this.getComponent_UNSAFE.bind(this),
                this.componentToolbarId,
            );
    }

    public async setComponentToolbar(id: string, type: string, url: string) {
        this.componentToolbarId = id;
        const componentToolbar = await this.dataModel.setComponentToolbar(id, type, url);
        this.componentToolbar = componentToolbar;
        this.root.set("component-toolbar", id);
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
