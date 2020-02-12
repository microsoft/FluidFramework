
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

import {
    Checkbox,
    IStackProps,
    Stack,
    TextField,
} from "office-ui-fabric-react";

import { IEventItemDataModel } from "./eventItem";

interface IEventItemViewProps {
    dataModel: IEventItemDataModel;
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

        this.props.dataModel.on("changed", (newEvent) => {
            this.setState({
                allDay: newEvent.allDay,
                title: newEvent.title,
                start: newEvent.start,
                end: newEvent.end,
                resource: newEvent.resource,
            });
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
                        onChange={(_, title)=> { this.props.dataModel.setTitle(title); }}
                    />
                    <Checkbox
                        label="All Day"
                        value={this.state.allDay.toString()}
                        onChange={(_, checked) => { this.props.dataModel.setAllDay(checked); }}
                    />
                    <TextField
                        label="Body"
                        multiline
                        rows={3}
                        value={this.state.resource}
                        onChange={(_, body) => { this.props.dataModel.setResource(body); }}
                    />
                </Stack>
            </Stack>
        );
    }
}
