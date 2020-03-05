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
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { ISpacesDataModel, SpacesDataModel, SupportedComponent } from "./dataModel";

import { SpacesGridView } from "./view";
import { ComponentToolbar, ComponentToolbarName } from "./components";

/**
 * Spaces is the Fluid
 */
export class Spaces extends PrimedComponent implements IComponentHTMLView {
    private dataModelInternal: ISpacesDataModel | undefined;
    private componentToolbar: ComponentToolbar | undefined;
    private static readonly componentToolbarId = "spaces-component-toolbar";

    // TODO #1188 - Component registry should automatically add ComponentToolbar
    // to the registry since it's required for the spaces component
    private static readonly factory = new PrimedComponentFactory("spaces", Spaces, []);

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

    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        this.dataModelInternal =
            new SpacesDataModel(
                this.root,
                this.createAndAttachComponent.bind(this),
                this.getComponent.bind(this),
                Spaces.componentToolbarId,
            );
        this.componentToolbar =
            await this.dataModel.addComponent<ComponentToolbar>(
                ComponentToolbarName,
                4,
                4,
                Spaces.componentToolbarId,
            );
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModelInternal.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.dataModelInternal =
            new SpacesDataModel(
                this.root,
                this.createAndAttachComponent.bind(this),
                this.getComponent.bind(this),
                Spaces.componentToolbarId,
            );
        this.componentToolbar = await this.getComponent<ComponentToolbar>(Spaces.componentToolbarId);
    }

    protected async componentHasInitialized() {
        if (this.componentToolbar) {
            this.componentToolbar.addListener("addComponent", (type: SupportedComponent, w?: number, h?: number) => {
                /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
                this.dataModel.addComponent(type, w, h);
            });
            this.componentToolbar.addListener("saveLayout", () => {
                this.dataModel.saveLayout();
            });
            this.componentToolbar.addListener("toggleEditable", (isEditable: boolean) => {
                this.dataModel.emit("editableUpdated", isEditable);
            });
            this.componentToolbar.changeEditState(this.dataModel.componentList.size - 1 === 0);
        }
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <SpacesGridView dataModel={this.dataModel} />,
            div);
    }
}
