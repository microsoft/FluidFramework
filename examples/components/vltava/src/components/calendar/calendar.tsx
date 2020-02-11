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

import { Calendar as BigCalendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";

import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "react-big-calendar/lib/css/react-big-calendar.css";

const calendarStyle: React.CSSProperties = {
    height: 500,
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

    /**
     * If someone just calls render they are not providing a scope and we just pass
     * undefined in.
     */
    public render(div: HTMLElement) {
        const localizer = momentLocalizer(moment);
        ReactDOM.render(
            <div style={calendarStyle}>
                <BigCalendar
                    localizer={localizer}
                    events={[]}
                    startAccessor="start"
                    endAccessor="end"
                />
            </div>,
            div);
    }
}
