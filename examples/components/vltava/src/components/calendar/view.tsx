
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Calendar,
    momentLocalizer,
    Event,
} from "react-big-calendar";
import moment from "moment";

import * as React from "react";

import { IDateTimeEvent } from "../../interfaces";
import { ICalendarDataModel } from "./calendar";

import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "react-big-calendar/lib/css/react-big-calendar.css";


const calendarStyle: React.CSSProperties = {
    height: "70vh",
};

interface ICalendarViewProps {
    dataModel: ICalendarDataModel;
}

interface ICalendarViewState {
    events: Event[];
}

export class CalendarView extends React.Component<ICalendarViewProps, ICalendarViewState> {
    public constructor(props: ICalendarViewProps) {
        super(props);

        this.state = {
            events: this.toEventFromIDateTimeEvent(Array.from(this.props.dataModel.events.values())),
        };

        this.props.dataModel.on("changed", () => {
            const events = this.toEventFromIDateTimeEvent(Array.from(this.props.dataModel.events.values()));
            this.setState({ events });
        });
    }
    private readonly localizer = momentLocalizer(moment);

    private readonly onSelectEvent = (event: Event, e: React.SyntheticEvent<HTMLElement>) => alert(event.resource);

    private readonly toEventFromIDateTimeEvent = (dtEvents: IDateTimeEvent[]): Event[] => {
        const events: Event[] = [];
        dtEvents.forEach((event) => {
            events.push({
                allDay: event.allDay,
                title: event.title,
                start: new Date(event.start),
                end: new Date(event.end),
                resource: event.resource,
            });
        });
        return events;
    };

    public render() {
        return (
            <div style={calendarStyle}>
                <Calendar
                    localizer={this.localizer}
                    events={this.state.events}
                    startAccessor="start"
                    endAccessor="end"
                    onSelectEvent={this.onSelectEvent}
                />
            </div>
        );
    }
}
