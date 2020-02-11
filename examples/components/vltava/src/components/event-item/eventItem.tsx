/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentDiscoverableInterfaces } from "@microsoft/fluid-framework-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { IEventData } from "../../interfaces";
/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class EventItem extends PrimedComponent
    implements
        IComponentHTMLVisual,
        IComponentDiscoverableInterfaces
{
    private static readonly factory = new PrimedComponentFactory(EventItem, []);

    public static getFactory() {
        return EventItem.factory;
    }

    public get IComponentHTMLVisual() { return this; }
    public get IComponentDiscoverableInterfaces() { return this; }


    public get discoverableInterfaces(): (keyof IComponent)[] {
        return [];
    }

    protected async componentInitializingFirstTime() {
        // Set some information so that we can view it later and hook up the interfaces
        // This should be configurable by the view.
        this.root.set("data",
            {
                allDay: false,
                title: this.url,
                start: new Date(),
                end: new Date(),
                resource: "body text",
            });
    }

    public render(div: HTMLElement) {
        const data = this.root.get<IEventData>("data");
        ReactDOM.render(
            <div>
                {JSON.stringify(data)}
            </div>,
            div);
    }

}
