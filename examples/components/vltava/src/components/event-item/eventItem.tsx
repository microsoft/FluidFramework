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

import {
    IComponentDateTimeEvent,
    IDateTimeEvent,
} from "../../interfaces";
/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class EventItem extends PrimedComponent
    implements
        IComponentHTMLVisual,
        IComponentDiscoverableInterfaces,
        IComponentDateTimeEvent
{
    private static readonly factory = new PrimedComponentFactory(EventItem, []);

    public static getFactory() {
        return EventItem.factory;
    }

    public get IComponentDateTimeEvent() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IComponentDiscoverableInterfaces() { return this; }

    public get event(): IDateTimeEvent {
        return this.root.get<IDateTimeEvent>("data");
    }

    public on(event: "changed", listener: (newEvent: IDateTimeEvent) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public get discoverableInterfaces(): (keyof IComponent)[] {
        return ["IComponentDateTimeEvent"];
    }

    protected async componentInitializingFirstTime() {
        // Set some information so that we can view it later and hook up the interfaces
        // This should be configurable by the view.
        this.root.set("data",
            {
                allDay: false,
                title: this.url,
                start: new Date().toUTCString(),
                end: new Date().toUTCString(),
                resource: "body text",
            });
    }

    protected async componentHasInitialized() {
        const matchMaker = await this.getService<IComponent>("matchMaker");
        const interfaceRegistry = matchMaker.IComponentInterfacesRegistry;
        if (interfaceRegistry) {
            interfaceRegistry.registerComponentInterfaces(this);
        }
    }

    public render(div: HTMLElement) {
        const data = this.root.get<IDateTimeEvent>("data");
        ReactDOM.render(
            <div>
                {JSON.stringify(data)}
            </div>,
            div);
    }

}
