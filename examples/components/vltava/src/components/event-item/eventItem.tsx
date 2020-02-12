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
import { IDirectoryValueChanged } from "@microsoft/fluid-map";

import * as React from "react";
import * as ReactDOM from "react-dom";

import {
    IComponentDateTimeEvent,
    IDateTimeEvent,
} from "../../interfaces";
import { EventItemView } from "./view";

export interface IEventItemDataModel extends IComponentDateTimeEvent {
    setTitle(newTitle: string): void;
    setStart(newStart: string): void;
    setEnd(newEnd: string): void;
    setResource(newResource: string): void;
    setAllDay(newAllDay: boolean): void;
}

/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class EventItem extends PrimedComponent
    implements
        IComponentHTMLVisual,
        IComponentDiscoverableInterfaces,
        IComponentDateTimeEvent,
        IEventItemDataModel
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

    public setTitle(newTitle: string): void {
        const event = this.event;
        event.title = newTitle;
        this.root.set("data", event);
    }

    public setStart(newStart: string): void {
        const event = this.event;
        event.start = newStart;
        this.root.set("data", event);
    }

    public setEnd(newEnd: string): void {
        const event = this.event;
        event.end = newEnd;
        this.root.set("data", event);
    }

    public setResource(newResource: string): void {
        const event = this.event;
        event.resource = newResource;
        this.root.set("data", event);
    }

    public setAllDay(newAllDay: boolean): void {
        const event = this.event;
        event.allDay = newAllDay;
        this.root.set("data", event);
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

        this.root.on("valueChanged", (changed: IDirectoryValueChanged) => {
            this.emit("changed", this.root.get(changed.key));
        });
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <>
                <h1>Date Event Item</h1>
                <EventItemView dataModel={this}/>
            </>,
            div);
    }
}
