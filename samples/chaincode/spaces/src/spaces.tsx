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

import { ISpacesDataModel, SpacesDataModel } from "./dataModel";

import { SpacesGridView } from "./view";

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Spaces extends PrimedComponent implements IComponentHTMLVisual {
    private dataModelInternal: ISpacesDataModel | undefined;

    private get dataModel(): ISpacesDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Spaces DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IComponentHTMLVisual() { return this; }

    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        this.dataModelInternal = new SpacesDataModel(this.root, this.createAndAttachComponent.bind(this), this.getComponent.bind(this));

        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModelInternal.setTemplate();
        }
    }

    protected async componentInitializingFromExisting() {
        this.dataModelInternal = new SpacesDataModel(this.root, this.createAndAttachComponent.bind(this), this.getComponent.bind(this));
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <SpacesGridView dataModel={this.dataModel}></SpacesGridView>,
            div);
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const SpacesInstantiationFactory = new PrimedComponentFactory(
    Spaces,
    [],
);
