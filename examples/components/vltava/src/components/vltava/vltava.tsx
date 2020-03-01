/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";
import uuid from "uuid/v4";

import { IVltavaDataModel, VltavaDataModel } from "./dataModel";
import { VltavaView } from "./view";

/**
 * Vltava is an application experience
 */
export class Vltava extends PrimedComponent implements IComponentHTMLView {
    private dataModelInternal: IVltavaDataModel | undefined;

    private static readonly factory = new PrimedComponentFactory(Vltava, []);

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

    protected async componentInitializingFirstTime(props: any) {
        const tabsComponent = await this.createAndAttachComponent(uuid(), "tabs");
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
