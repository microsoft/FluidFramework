/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { InternalRegistry } from "../..";
import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";


export class TabsComponent extends PrimedComponent implements IComponentHTMLVisual {
    private dataModelInternal: ITabsDataModel | undefined;

    private static readonly factory = new PrimedComponentFactory(TabsComponent, []);

    public static getFactory() {
        return TabsComponent.factory;
    }

    private get dataModel(): ITabsDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Vltava DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IComponentHTMLVisual() { return this; }

    protected async componentInitializingFirstTime(props: any) {
        // create the tabs directory
        this.root.createSubDirectory("tab-ids");
    }

    protected async componentHasInitialized() {
        const internalRegistry = (await this.context.hostRuntime.IComponentRegistry.get("")) as InternalRegistry;
        this.dataModelInternal =
            new TabsDataModel(
                this.root,
                internalRegistry,
                this.createAndAttachComponent.bind(this),
                this.getComponent.bind(this),
            );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TabsView dataModel={this.dataModel} />,
            div);
    }
}
