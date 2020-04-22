/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponent, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { TabsDataModel, ITabsDataModel } from "./dataModel";
import { TabsView } from "./view";

export const TabsName = "tabs";

export class TabsComponent extends PrimedComponent implements IComponentHTMLView {
    private dataModelInternal: ITabsDataModel | undefined;

    private static readonly factory = new PrimedComponentFactory(TabsName, TabsComponent, [], {});

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

    protected async componentInitializingFirstTime() {
        // create the tabs directory
        this.root.createSubDirectory("tab-ids");
    }

    protected async createAndAttachComponentWithId<T extends IComponent & IComponentLoadable>(
        id: string, pkg: string, props?: any,
    ): Promise<T> {
        const componentRuntime = await this.context.createComponent(id, pkg, props);
        const component = await this.asComponent<T>(componentRuntime.request({ url: "/" }));
        componentRuntime.attach();
        return component;
    }

    protected async componentHasInitialized() {
        const registry = await this.context.hostRuntime.IComponentRegistry.get("");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const registryDetails = (registry as IComponent).IComponentRegistryDetails!;
        this.dataModelInternal =
            new TabsDataModel(
                this.root,
                registryDetails,
                this.createAndAttachComponent.bind(this),
                this.createAndAttachComponentWithId.bind(this),
                this.getComponentFromDirectory.bind(this),
            );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <TabsView dataModel={this.dataModel} />,
            div);
    }
}
