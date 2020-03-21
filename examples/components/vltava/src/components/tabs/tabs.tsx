/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponent, IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";

export class TabsComponent extends PrimedComponent implements IComponentHTMLView {
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

    public get IComponentHTMLView() { return this; }

    protected async componentInitializingFirstTime(props: any) {
        // create the tabs directory
        this.root.createSubDirectory("tab-ids");
    }

    protected async componentHasInitialized() {
        const registry = await this.context.hostRuntime.IComponentRegistry.get("");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const registryDetails = (registry as IComponent).IComponentRegistryDetails!;
        this.dataModelInternal =
            new TabsDataModel(
                this.root,
                registryDetails,
                this.createAndAttachComponent_NEW.bind(this),
            );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TabsView dataModel={this.dataModel} />,
            div);
    }
}
