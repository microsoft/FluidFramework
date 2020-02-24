/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLView, IComponent,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { ISpacesDataModel, SpacesDataModel } from "./dataModel";

import { SpacesGridView } from "./view";
import { ComponentToolbar } from "./components";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";

/**
 * Spaces is the Fluid
 */
export class Spaces extends PrimedComponent implements IComponentHTMLView, IComponentCollection {
    private dataModelInternal: ISpacesDataModel | undefined;
    private componentToolbar: ComponentToolbar | undefined;
    private static readonly componentToolbarId = "spaces-component-toolbar";

    // TODO #1188 - Component registry should automatically add ComponentToolbar
    // to the registry since it's required for the spaces component
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

    public get IComponentHTMLView() { return this; }
    public get IComponentCollection() { return this; }


    public createCollectionItem<T>(options: T): IComponent{
        // eslint-disable-next-line dot-notation
        const id: string = options["id"];
        const type: string = options["type"];
        const url: string = options["url"];
        return this.dataModel.setComponent(id, type, url);
    }

    public removeCollectionItem(instance: IComponent): void {
        let componentUrl: string;
        if (instance.IComponentLoadable) {
            componentUrl = instance.IComponentLoadable.url;
            this.dataModel.removeComponent(componentUrl);
        }
    }

    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        await this.initializeDataModel();
        // this.componentToolbar =
        //     await this.dataModel.addComponent<ComponentToolbar>(
        //         ComponentToolbarName,
        //         4,
        //         4,
        //         Spaces.componentToolbarId,
        //     );
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModelInternal.setTemplate();
        }
    }

    public async setComponentToolbar(id: string, type: string) {
        this.dataModel.setComponentToolbar(id, type);
    }

    protected async componentInitializingFromExisting() {
        await this.initializeDataModel();
    }

    private async initializeDataModel() {
        this.dataModelInternal =
            new SpacesDataModel(
                this.root,
                this.createAndAttachComponent.bind(this),
                this.getComponent.bind(this),
                Spaces.componentToolbarId,
            );
    }

    protected async componentHasInitialized() {
        if (this.componentToolbar) {
            this.componentToolbar.addListener("addComponent", (type: string, w?: number, h?: number) => {
                /* eslint-disable-next-line @typescript-eslint/no-floating-promises */
                this.dataModel.addComponent(type, w, h);
            });
            this.componentToolbar.addListener("saveLayout", () => {
                this.dataModel.saveLayout();
            });
            this.componentToolbar.addListener("toggleEditable", (isEditable: boolean) => {
                this.dataModel.emit("editableUpdated", isEditable);
            });
        }
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div><label>hi</label><SpacesGridView dataModel={this.dataModel}/></div>
            ,
            div);
    }
}
