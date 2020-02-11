
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
            events: this.props.dataModel.events,
        };

        this.props.dataModel.on("changed", () => {
            this.setState({ events: this.props.dataModel.events });
        });
    }
    private readonly localizer = momentLocalizer(moment);

    private readonly onSelectSlot = (slotInfo: {
        start: Date;
        end: Date;
        slots: Date[] | string[];
        action: "select" | "click" | "doubleClick";
    }) => alert(slotInfo.action);

    private readonly onSelectEvent = (event: Event, e: React.SyntheticEvent<HTMLElement>) => alert(event.title);

    public render() {
        return (
            <div style={calendarStyle}>
                <Calendar
                    localizer={this.localizer}
                    events={this.state.events}
                    startAccessor="start"
                    endAccessor="end"
                    onSelectSlot={this.onSelectSlot}
                    onSelectEvent={this.onSelectEvent}
                />
            </div>
        );
    }
}
