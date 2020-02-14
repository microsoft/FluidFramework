
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

import {
    Checkbox,
    DatePicker,
    IStackProps,
    Stack,
    TextField,
    DayOfWeek,
    IDatePickerStrings,
} from "office-ui-fabric-react";

import { IDateEventItemDataModel } from "./eventItem";


const DayPickerStrings: IDatePickerStrings = {
    months: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],

    shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],

    shortDays: ["S", "M", "T", "W", "T", "F", "S"],

    goToToday: "Go to today",
    prevMonthAriaLabel: "Go to previous month",
    nextMonthAriaLabel: "Go to next month",
    prevYearAriaLabel: "Go to previous year",
    nextYearAriaLabel: "Go to next year",
    closeButtonAriaLabel: "Close date picker",
};

interface IEventItemViewProps {
    dataModel: IDateEventItemDataModel;
}

interface IEventItemViewState {
    allDay: boolean;
    title: string;
    start: string;
    end: string;
    resource: any;
}

export class EventItemView extends React.Component<IEventItemViewProps, IEventItemViewState> {
    public constructor(props: IEventItemViewProps) {
        super(props);

        const event = this.props.dataModel.event;
        this.state = {
            allDay: event.allDay,
            title: event.title,
            start: event.start,
            end: event.end,
            resource: event.resource,
        };

        this.props.dataModel.on("changed", (id) => {

            switch(id) {
                case "allDay" :
                    this.setState({allDay: this.props.dataModel.allDay});
                    break;
                case "title" :
                    this.setState({title: this.props.dataModel.title});
                    break;
                case "start" :
                    this.setState({start: this.props.dataModel.start});
                    break;
                case "end" :
                    this.setState({end: this.props.dataModel.end});
                    break;
                case "resource" :
                    this.setState({end: this.props.dataModel.resource});
                    break;
                default:
                    break;
            }
        });
    }

    public render() {
        const columnProps: Partial<IStackProps> = {
            tokens: { childrenGap: 15 },
            styles: { root: { width: 300 } },
        };

        return (
            <Stack horizontal tokens={{ childrenGap: 50 }} styles={{ root: { width: 650 } }}>
                <Stack {...columnProps}>
                    <TextField
                        label="Title"
                        value={this.state.title}
                        onChange={(_, title) => { this.props.dataModel.title = title; }}
                    />
                    <Checkbox
                        label="All Day"
                        checked={this.state.allDay}
                        onChange={(_, checked) => { this.props.dataModel.allDay = checked; } }
                    />
                    <DatePicker
                        label="Start Date"
                        firstDayOfWeek={DayOfWeek.Sunday}
                        strings={DayPickerStrings}
                        value= {new Date(this.state.start)}
                        onSelectDate= {(date) => { this.props.dataModel.start = date.toUTCString(); }}
                    />
                    <DatePicker
                        label="End Date"
                        firstDayOfWeek={DayOfWeek.Sunday}
                        strings={DayPickerStrings}
                        value= {new Date(this.state.end)}
                        onSelectDate= {(date) => { this.props.dataModel.end = date.toUTCString(); }}
                    />
                    <TextField
                        label="Body"
                        multiline
                        rows={3}
                        value={this.state.resource}
                        onChange={(_, body) => { this.props.dataModel.resource = body; }}
                    />
                </Stack>
            </Stack>
        );
    }
}
