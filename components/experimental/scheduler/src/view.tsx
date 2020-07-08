/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import * as React from "react";
import {
    Stack,
    FocusZone,
    Dropdown,
    initializeIcons,
    TextField,
    FocusZoneDirection,
    IconButton,
    PrimaryButton,
    DatePicker,
    DayOfWeek,
} from "office-ui-fabric-react";
import { CollaborativeTextArea } from "@fluidframework/react-inputs";
initializeIcons();

import { IPersonView, AvailabilityType, IComment } from "./interface";
import { PrimedContext } from "./context";
import { DayPickerStrings } from "./data";

export function View() {
    const {
        commentState,
        commentReducer,
        personState,
        personReducer,
    } = React.useContext(PrimedContext);

    if (!commentState
        || !commentReducer
        || !personState
        || !personReducer
    ) {
        return <div>{"Context is not providing data correctly"}</div>;
    }
    const [currentComment, setCurrentComment] = React.useState("");

    const onRenderHeader = (dates: Map<string, Date>) => {
        const content: JSX.Element[] = [];
        for (const [dateKey, dateItem] of dates.entries()) {
            content.push(
                <div className="headerCell" key={dateKey} style={{ width: "22%", paddingBottom: "2vh" }}>
                    <DatePicker
                        isRequired={ false }
                        allowTextInput={ true }
                        ariaLabel={ "datePicker" }
                        firstDayOfWeek={ DayOfWeek.Sunday }
                        strings={ DayPickerStrings }
                        value={ new Date(dateItem) }
                        onSelectDate={ (date) => personReducer.editDate.function(personState, dateKey, date) }
                    />
                </div>,
            );
        }

        return (
            <Stack className="header" horizontal tokens={{ childrenGap: 10 }}>
                <div className="headerCell" style={{ width: "22%", fontFamily: "sans-serif", fontWeight: "bold" }}>
                    {"Scheduler"}
                </div>
                {content}
            </Stack>
        );
    };

    const onRenderRow = (personKey: string, person: IPersonView): JSX.Element => {
        const checkmarks: JSX.Element[] = [];
        for (const [dateKey, availability] of person.availabilities.entries()) {
            checkmarks.push(
                <div className="cell" key={dateKey} style={{ width: "22%" }}>
                    <Dropdown
                        options={[
                            { key: AvailabilityType.No, text: "No" },
                            { key: AvailabilityType.Maybe, text: "Maybe" },
                            { key: AvailabilityType.Yes, text: "Yes" },
                        ]}
                        selectedKey={availability.availabilityType}
                        onChange={(e, o) => {
                            if (o !== undefined) {
                                personReducer.updateAvailability.function(
                                    personState,
                                    personKey,
                                    {
                                        dateKey,
                                        availabilityType: o.key as number,
                                    });
                            }
                        }}
                    />
                </div>,
            );
        }

        return (
            <Stack className="row" key={personKey} horizontal tokens={{ childrenGap: 10 }}>
                <div className="cell" key="name" style={{ width: "22%" }}>
                    <CollaborativeTextArea
                        style={{ width: "100%", height: "2.7vh", resize: "none", fontFamily: "sans-serif" }}
                        sharedString={person.name}
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

    const onRenderRows = (people: Map<string, IPersonView>): JSX.Element => {
        const rows: JSX.Element[] = [];
        for (const [personKey, person] of people.entries()) {
            rows.push(onRenderRow(personKey, person));
        }
        return <div className="rows">{rows}</div>;
    };

    const onRenderComments = (items: IComment[]): JSX.Element => {
        const comments = items.map((item, key) => {
            return (
                <li key={key}>
                    {item.message}
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
                            commentReducer.add.function(commentState, currentComment);
                            setCurrentComment("");
                        }}
                    />
                </Stack>
                <ul>{comments}</ul>
            </Stack>
        );
    };
    return (
        <Stack
            style={{ background: "#ddd", padding: 20 }}
            tokens={{ childrenGap: 10 }}
        >
            <FocusZone direction={FocusZoneDirection.bidirectional}>
                {onRenderHeader(personState.viewState.dates)}
                {onRenderRows(personState.viewState.people)}
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
}
