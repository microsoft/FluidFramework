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
    allDay: boolean;
    end: string;
    start: string;
    title: string;
    resource: string;
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

    public set allDay(value: boolean) {
        this.root.set("allDay", value);
    }

    public get allDay(): boolean {
        return this.root.get("allDay");
    }

    public set title(value: string) {
        this.root.set("title", value);
    }

    public get title(): string {
        return this.root.get("title");
    }

    public set start(value: string) {
        this.root.set("start", value);
    }

    public get start(): string {
        return this.root.get("start");
    }

    public set end(value: string) {
        this.root.set("end", value);
    }

    public get end(): string {
        return this.root.get("end");
    }

    public set resource(value: string) {
        this.root.set("resource", value);
    }

    public get resource(): string {
        return this.root.get("resource");
    }

    public get event(): IDateTimeEvent {
        return {
            allDay: this.root.get("allDay"),
            title: this.root.get("title"),
            start: this.root.get("start"),
            end: this.root.get("end"),
            resource: this.root.get("resource"),
        };
    }

    public get IComponentDateTimeEvent() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IComponentDiscoverableInterfaces() { return this; }

    public on(event: "changed", listener: (id: string) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public get discoverableInterfaces(): (keyof IComponent)[] {
        return ["IComponentDateTimeEvent"];
    }

    public setEvent(event: Partial<IDateTimeEvent>) {
        this.root.set("data", {...this.event, ...event});
    }

    protected async componentInitializingFirstTime() {
        // Set some information so that we can view it later and hook up the interfaces
        // This should be configurable by the view.
        this.allDay = false;
        this.title = "New Date Event";
        this.start =  new Date().toUTCString();
        this.end = new Date().toUTCString();
        this.resource = "Initial Body Text";
    }

    protected async componentHasInitialized() {
        const matchMaker = await this.getService<IComponent>("matchMaker");
        const interfaceRegistry = matchMaker.IComponentInterfacesRegistry;
        if (interfaceRegistry) {
            interfaceRegistry.registerComponentInterfaces(this);
        }

        this.root.on("valueChanged", (changed: IDirectoryValueChanged) => {
            this.emit("changed", changed.key);
        });
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div style={{padding: 20}}>
                <h1>Date Event Item</h1>
                <EventItemView dataModel={this}/>
            </div>,
            div);
    }
}
