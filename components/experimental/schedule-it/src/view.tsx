/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import * as React from "react";
import DatePicker from "react-datepicker";
import {
    Stack,
    FocusZone,
    Dropdown,
    initializeIcons,
    TextField,
    FocusZoneDirection,
    IconButton,
    PrimaryButton,
} from "office-ui-fabric-react";
import { SharedMap } from "@microsoft/fluid-map";
import { PrimedContext } from "./context";
import { IPerson, AvailabilityType, IComment, IAvailability, IDate } from "./interface";
initializeIcons();
// eslint-disable-next-line import/no-unassigned-import
import "react-datepicker/dist/react-datepicker.css";

export const ScheduleItView = () => {
    const {
        commentState,
        commentReducer,
        personState,
        personReducer,
        personSelector,
        dateState,
        dateReducer,
    } = React.useContext(PrimedContext);

    if (!commentState
        || !commentReducer
        || !personState
        || !personReducer
        || !dateState
        || !dateReducer
        || !personSelector
    ) {
        return <div>{"Context is not providing data correctly"}</div>;
    }
    const [currentComment, setCurrentComment] = React.useState("");

    const onRenderHeader = (dates: SharedMap) => {
        const content: JSX.Element[] = [];
        for (const dateKey of dates.keys()) {
            const date = dates.get<IDate>(dateKey);
            content.push(
                <div className="headerCell" key={dateKey} style={{ width: "25%" }}>
                    <DatePicker
                        selected={new Date(date.date)}
                        disabled
                    />
                </div>,
            );
        }

        return (
            <Stack className="header" horizontal tokens={{ childrenGap: 10 }}>
                <div className="headerCell" style={{ width: "25%" }}>
                    {"People"}
                </div>
                {content}
            </Stack>
        );
    };

    const onRenderRow = (person: IPerson, personKey: string): JSX.Element => {
        const checkmarks: JSX.Element[] = [];
        const personAvailabilityMap = personSelector.getAvailabilityMap.function(
            personState.viewState,
            personState.dataProps,
            person.availabilityMapHandle,
        ) as SharedMap;
        if (personAvailabilityMap !== undefined) {
            for (const dateKey of personAvailabilityMap.keys()) {
                const availabilityItem = personAvailabilityMap.get<IAvailability>(dateKey);
                checkmarks.push(
                    <div className="cell" key={dateKey} style={{ width: "25%" }}>
                        <Dropdown
                            options={[
                                { key: AvailabilityType.No, text: "No" },
                                { key: AvailabilityType.Maybe, text: "Maybe" },
                                { key: AvailabilityType.Yes, text: "Yes" },
                            ]}
                            selectedKey={availabilityItem.availabilityType}
                            onChange={(e, o) => {
                                if (o !== undefined) {
                                    personReducer.updateAvailability.function(
                                        personState,
                                        personKey,
                                        {
                                            dateKey: availabilityItem.dateKey,
                                            availabilityType: o.key as number,
                                        });
                                }
                            }}
                        />
                    </div>,
                );
            }
        }

        return (
            <Stack className="row" key={personKey} horizontal tokens={{ childrenGap: 10 }}>
                <div className="cell" key="name" style={{ width: "25%" }}>
                    <TextField
                        value={person.name}
                        onChange={(e, v) => {
                            if (v !== undefined) {
                                personReducer.updateName.function(
                                    personState,
                                    personKey,
                                    v,
                                );
                            }
                        }}
                    />
                </div>
                {checkmarks}
                <IconButton
                    onClick={() => personReducer.removePerson.function(personState,personKey)}
                    iconProps={{ iconName: "CalculatorSubtract" }}
                />
            </Stack>
        );
    };

    const onRenderRows = (items: SharedMap): JSX.Element => {
        const rows: JSX.Element[] = [];
        for (const personKey of items.keys()) {
            const item = items.get<IPerson>(personKey);
            if (item !== undefined) {
                rows.push(onRenderRow(item, personKey));
            }
        }
        return <div className="rows">{rows}</div>;
    };

    const onRenderComments = (items: IComment[]): JSX.Element => {
        const commentsJSX = items.map((item, key) => {
            return (
                <li key={key}>
          [{item.name}]: {item.message}
                </li>
            );
        });
        return (
            <Stack>
                <Stack horizontal verticalAlign="end">
                    <Stack.Item grow={true}>
                        <TextField
                            value={currentComment}
                            onChange={(e, v) => setCurrentComment(v ?? "")}
                            label="Add Comment"
                        />
                    </Stack.Item>
                    <PrimaryButton
                        text="Submit"
                        onClick={() => {
                            commentReducer.add.function(commentState, currentComment, "name");
                            setCurrentComment("");
                        }}
                    />
                </Stack>
                <ul>{commentsJSX}</ul>
            </Stack>
        );
    };
    return (
        <Stack
            style={{ background: "#ddd", padding: 20 }}
            tokens={{ childrenGap: 10 }}
        >
            <FocusZone direction={FocusZoneDirection.bidirectional}>
                {onRenderHeader(dateState.viewState.dateMap)}
                {onRenderRows(personState.viewState.personMap)}
            </FocusZone>

            <Stack horizontal tokens={{ childrenGap: 10 }}>
                <IconButton
                    onClick={() => personReducer.addPerson.function(personState)}
                    iconProps={{ iconName: "Add" }}
                />
            </Stack>
            {onRenderComments(commentState.viewState.comments)}
        </Stack>
    );
};
