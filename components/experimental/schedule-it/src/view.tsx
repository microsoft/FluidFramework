/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
} from "office-ui-fabric-react";
import { SharedMap } from "@microsoft/fluid-map";
import { PrimedContext } from "./context";
import { IPerson, AvailabilityType, IComment, IAvailability, IDate } from "./interface";
initializeIcons();

export const ScheduleItView = () => {
    const {
        comments,
        commentDispatch,
        personMap,
        personDispatch,
        dateMap,
        dateDispatch,
        personFetch,
    } = React.useContext(PrimedContext);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!comments || !commentDispatch || !personMap || !personDispatch || !dateMap || !dateDispatch || !personFetch) {
        return <div>{"Context is not providing data correctly"}</div>;
    }
    const [currentComment, setCurrentComment] = React.useState("");

    const onRenderHeader = (dates: SharedMap) => {
        const content: JSX.Element[] = [];
        for (const dateKey of dates.keys()) {
            const date = dates.get<IDate>(dateKey);
            content.push(
                <div className="headerCell" key={dateKey} style={{ width: "25%" }}>
                    <label>{date.key}</label>
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
        const personAvailabilityMap = personFetch("getAvailabilityMap", person.availabilityMapHandle) as SharedMap;
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
                                    personDispatch(
                                        "updateAvailability",
                                        personKey,
                                        {
                                            dateKey: availabilityItem.dateKey,
                                            availabilityType: o.key as number,
                                        },
                                    );
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
                                personDispatch("updateName", personKey, v);
                            }
                        }}
                    />
                </div>
                {checkmarks}
            </Stack>
        );
    };

    const onRenderRows = (items: SharedMap): JSX.Element => {
        const rows: JSX.Element[] = [];
        for (const personKey of items.keys()) {
            const item = items.get<IPerson>(personKey);
            rows.push(onRenderRow(item, personKey));
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
                            commentDispatch("add", currentComment, "name");
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
                {onRenderHeader(dateMap)}
                {onRenderRows(personMap)}
            </FocusZone>

            <Stack horizontal tokens={{ childrenGap: 10 }}>
                <IconButton onClick={() => personDispatch("addPerson")} iconProps={{ iconName: "Add" }} />
            </Stack>
            {onRenderComments(comments)}
        </Stack>
    );
};
