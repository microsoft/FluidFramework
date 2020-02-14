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
    IComponentHTMLView,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentDiscoverInterfaces } from "@microsoft/fluid-framework-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import { IComponentDateTimeEvent, IDateTimeEvent } from "../../interfaces";

import { CalendarView } from "./view";

export interface ICalendarDataModel {
    events: Map<string, IDateTimeEvent>;
    on(event: "changed", listener: () => void): this;
}

/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class Calendar extends PrimedComponent
    implements
    ICalendarDataModel,
    IComponentHTMLView,
    IComponentDiscoverInterfaces
{
    private remoteEventsDir: IDirectory;

    private static readonly factory = new PrimedComponentFactory(Calendar, []);

    public static getFactory() {
        return Calendar.factory;
    }

    public get IComponentHTMLView() { return this; }
    public get IComponentDiscoverInterfaces() { return this; }

    public get interfacesToDiscover(): (keyof IComponent)[] {
        return [
            "IComponentDateTimeEvent",
        ];
    }

    public notifyComponentsDiscovered(interfaceName: keyof IComponent, components: readonly IComponent[]): void {
        components.forEach((component) => {
            if (!component[interfaceName]) {
                console.log(`component doesn't support interface ${interfaceName}`);
            }

            switch(interfaceName) {
                case "IComponentDateTimeEvent": {
                    const event = component.IComponentDateTimeEvent;
                    if (event){
                        const loadable = component.IComponentLoadable;
                        const handle = component.IComponentHandle;
                        if (loadable && handle) {
                            this.remoteEventsDir.set(loadable.url, handle.IComponentHandle);
                        }
                    }
                }
                default:
                    // There is no default
            }
        });
    }

    public readonly events = new Map<string, IDateTimeEvent>();

    public on(event: "changed", listener: () => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    protected async componentInitializingFirstTime() {
        this.root.createSubDirectory("remote-events");
    }

    protected async componentHasInitialized() {
        this.remoteEventsDir = this.root.getSubDirectory("remote-events");

        // Setup listeners incase our list of events changes
        this.root.on("valueChanged", (changed: IDirectoryValueChanged, local: boolean) => {
            if (changed.path === this.remoteEventsDir.absolutePath) {
                // our subdirectory changed and we should update our events
                const value = this.remoteEventsDir.get<IComponentHandle>(changed.key);
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                value.get<IComponentDateTimeEvent>().then((event) => {
                    this.events.set(changed.key, event.event);
                    const emit = () => this.emit("changed");
                    // Set a listener so if the event itself changes we can re-get the value
                    event.on("changed", () => {
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        value.get<IComponentDateTimeEvent>().then((item) => {
                            this.events.set(changed.key, item.event);
                            emit();
                        });
                    });
                    this.emit("changed");
                });
            }
        });

        // Resolve handles we have to other Date Event Components
        const keys = Array.from(this.remoteEventsDir.keys());
        for (let i = 0; i < this.remoteEventsDir.size; i++) {
            const key = keys[i];
            const value = this.remoteEventsDir.get<IComponentHandle>(key);
            const event = await value.get<IComponentDateTimeEvent>();
            const emit = () => this.emit("changed");
            // Set a listener so if the event itself changes we can re-get the value
            event.on("changed", () => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                value.get<IComponentDateTimeEvent>().then((item) => {
                    this.events.set(key, item.event);
                    emit();
                });
            });
            this.events.set(key, event.event);
        }

        // Register our component with the match maker so we can find new events
        const matchMaker = await this.getService<IComponent>("matchMaker");
        const interfaceRegistry = matchMaker.IComponentInterfacesRegistry;
        if (interfaceRegistry) {
            interfaceRegistry.registerComponentInterfaces(this);
        }
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <CalendarView dataModel={this}/>,
            div);
    }
}
