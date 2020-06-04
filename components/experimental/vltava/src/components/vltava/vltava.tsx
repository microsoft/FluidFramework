/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@fluidframework/aqueduct";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import React from "react";
import ReactDOM from "react-dom";

import { TabsComponent } from "../tabs/tabs";
import { IVltavaDataModel, VltavaDataModel } from "./dataModel";
import { VltavaView } from "./view";

export const VltavaName = "vltava";

/**
 * Vltava is an application experience
 */
export class Vltava extends PrimedComponent implements IComponentHTMLView {
    private dataModelInternal: IVltavaDataModel | undefined;

    private static readonly factory = new PrimedComponentFactory(VltavaName, Vltava, [], {});

    public static getFactory() {
        return Vltava.factory;
    }

    private get dataModel(): IVltavaDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Vltava DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IComponentHTMLView() { return this; }

    protected async componentInitializingFirstTime() {
        const tabsComponent = await TabsComponent.getFactory().createComponent(this.context);
        this.root.set("tabs-component-id", tabsComponent.handle);
    }

    protected async componentHasInitialized() {
        this.dataModelInternal =
            new VltavaDataModel(
                this.root,
                this.context,
                this.runtime);
    }

    /**
     * Will return a new Vltava View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <VltavaView dataModel={this.dataModel} />,
            div);
    }
}
