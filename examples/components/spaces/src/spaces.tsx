/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { ISpacesDataModel, SpacesDataModel, SupportedComponent } from "./dataModel";

import { SpacesGridView } from "./view";
import { Adder } from "./components";

/**
 * Spaces is the Fluid
 */
export class Spaces extends PrimedComponent implements IComponentHTMLVisual {
    private dataModelInternal: ISpacesDataModel | undefined;
    private adderComponent: Adder | undefined;
    private isEditable = true;
    private adderComponentId = "spaces-adder";
    private static readonly factory = new PrimedComponentFactory(Spaces, []);

    public static getFactory() {
        return Spaces.factory;
    }

    private get dataModel(): ISpacesDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Spaces DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IComponentHTMLVisual() { return this; }

    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        this.dataModelInternal =
            new SpacesDataModel(this.root, this.createAndAttachComponent.bind(this), this.getComponent.bind(this));
        this.adderComponent = await this.dataModel.addComponent<Adder>("adder", 4, 4, this.adderComponentId);
        this.adderComponent.root.set("isEditable", this.isEditable);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModelInternal.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.dataModelInternal =
            new SpacesDataModel(this.root, this.createAndAttachComponent.bind(this), this.getComponent.bind(this));
        this.adderComponent = await this.getComponent<Adder>(this.adderComponentId);
        this.adderComponent.root.set("isEditable", this.isEditable);
    }

    protected async componentHasInitialized() {
        if (this.adderComponent) {
            this.adderComponent.addListener("add", async (type: SupportedComponent, w?: number, h?: number) => {
                await this.dataModel.addComponent(type, w, h);
            });
            this.adderComponent.addListener("saveLayout", async () => {
                await this.dataModel.saveLayout();
            });
            this.adderComponent.addListener("toggleEditable", () => {
                this.isEditable = !this.isEditable;
                this.adderComponent.root.set("isEditable", this.isEditable);
                this.dataModel.emit("editableUpdated", this.isEditable);
            });
        }        
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <SpacesGridView dataModel={this.dataModel} adderComponentId={this.adderComponentId} editable={this.isEditable}></SpacesGridView>,
            div);
    }
}
