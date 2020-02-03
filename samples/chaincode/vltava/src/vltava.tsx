/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";

import * as React from "react";
import * as ReactDOM from "react-dom";
import uuid from "uuid/v4";

import { IVltavaDataModel, VltavaDataModel } from "./dataModel";
import { VltavaView } from "./view";
import { InternalRegistry } from "./";

/**
 * Vltava is a default component manager
 */
export class Vltava extends PrimedComponent implements IComponentHTMLVisual {
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

    public get IComponentHTMLVisual() { return this; }

    protected async componentInitializingFirstTime(props: any) {
        const defaultComponentId = uuid();
        await this.createAndAttachComponent(defaultComponentId, "tabs");
        this.root.set("default-component-id", defaultComponentId);
    }

    protected async componentHasInitialized() {
        this.dataModelInternal =
            new VltavaDataModel(
                this.root,
                this.context,
                this.runtime,
                this.createAndAttachComponent.bind(this),
                this.getComponent.bind(this));

        const Foo = (await this.context.hostRuntime.IComponentRegistry.get("")) as InternalRegistry;
        console.log(Foo.keys);
        console.log(Foo.containerComponentArray);

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
