/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { LastEditedTrackerId } from "../../index";

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

    protected async componentInitializingFirstTime(props: any) {
        const tabsComponent = await this.createAndAttachComponent("tabs");
        this.root.set("tabs-component-id", tabsComponent.handle);
    }

    protected async componentHasInitialized() {
        // Get the last edited tracker from the container with id LastEditedTrackerId.
        const response = await this.context.hostRuntime.request({ url: LastEditedTrackerId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error("Can't find last edited component");
        }
        const lastEditedTracker = response.value.IComponentLastEditedTracker;

        this.dataModelInternal =
            new VltavaDataModel(
                this.root,
                lastEditedTracker,
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
