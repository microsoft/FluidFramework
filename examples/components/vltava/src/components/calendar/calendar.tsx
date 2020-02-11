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
import { IComponentDiscoverInterfaces } from "@microsoft/fluid-framework-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import {
    Calendar as BigCalendar,
    momentLocalizer,
    Event,
} from "react-big-calendar";
import moment from "moment";

import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "react-big-calendar/lib/css/react-big-calendar.css";

const calendarStyle: React.CSSProperties = {
    height: "70vh",
};

/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class Calendar extends PrimedComponent implements IComponentHTMLVisual, IComponentDiscoverInterfaces {
    private static readonly factory = new PrimedComponentFactory(Calendar, []);

    private readonly events: Event[] = [{
        start: new Date(),
        end: new Date(),
        title: "foo",
    }];

    public static getFactory() {
        return Calendar.factory;
    }

    public get IComponentHTMLVisual() { return this; }
    public get IComponentDiscoverInterfaces() { return this; }

    public get interfacesToDiscover(): (keyof IComponent)[] {
        return [
            "IComponentEventData",
        ];
    }

    public notifyComponentsDiscovered(interfaceName: keyof IComponent, components: readonly IComponent[]): void {
        components.forEach((component) => {
            if (!component[interfaceName]) {
                console.log(`component doesn't support interface ${interfaceName}`);
            }

            switch(interfaceName) {
                case "IComponentEventData": {
                    const event = component.IComponentEventData;
                    if (event){
                        this.events.push(event.event);
                    }
                }
                default:
            }
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

        const onSelectSlot = (slotInfo: {
            start: Date;
            end: Date;
            slots: Date[] | string[];
            action: "select" | "click" | "doubleClick";
        }) => alert(slotInfo.action);

        const onSelectEvent = (event: Event, e: React.SyntheticEvent<HTMLElement>) => alert(event.title);

        const localizer = momentLocalizer(moment);
        ReactDOM.render(
            <div style={calendarStyle}>
                <BigCalendar
                    localizer={localizer}
                    events={this.events}
                    startAccessor="start"
                    endAccessor="end"
                    onSelectSlot={onSelectSlot}
                    onSelectEvent={onSelectEvent}
                />
            </div>,
            div);
    }
}
