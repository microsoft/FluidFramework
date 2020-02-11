/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

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
export class Calendar extends PrimedComponent implements IComponentHTMLVisual {
    private static readonly factory = new PrimedComponentFactory(Calendar, []);

    public static getFactory() {
        return Calendar.factory;
    }

    public get IComponentHTMLVisual() { return this; }

    public render(div: HTMLElement) {

        const events: Event[] = [{
            start: new Date(),
            end: new Date(),
            title: "foo",
        }];

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
                    events={events}
                    startAccessor="start"
                    endAccessor="end"
                    onSelectSlot={onSelectSlot}
                    onSelectEvent={onSelectEvent}
                />
            </div>,
            div);
    }
}
