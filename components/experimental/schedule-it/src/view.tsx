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
import { PrimedContext } from "./context";
import { IDateMap, IPersonMap, IPerson, AvailabilityType, IComment } from "./interface";
initializeIcons();

export const ScheduleItView = () => {
    const {
        comments,
        commentDispatch,
        personMap,
        personDispatch,
        dateMap,
        dateDispatch,
    } = React.useContext(PrimedContext);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!comments || !commentDispatch || !personMap || !personDispatch || !dateMap || !dateDispatch) {
        return <div>{"Context is not providing data correctly"}</div>;
    }
    const [currentComment, setCurrentComment] = React.useState("");

    const onRenderHeader = (items: IDateMap) => {
        // const content = Object.entries(items).map(([key, item]) => {
        //     return (
        //         <div className="headerCell" key={key} style={{ width: "25%" }}>
        //             <DatePicker
        //                 value={item.date}
        //                 onSelectDate={(newDate) => dateDispatch("set", newDate)}
        //             />
        //         </div>
        //     );
        // });

        return (
            <Stack className="header" horizontal tokens={{ childrenGap: 10 }}>
                <div className="headerCell" style={{ width: "25%" }}>
                    {"People"}
                </div>
                {/* {content} */}
            </Stack>
        );
    };

    const onRenderRow = (item: IPerson, personKey: string): JSX.Element => {
        const checkmarks = Object.entries(item.availabilityMap).map(([keyA, itemA], i) => {
            return (
                <div className="cell" key={keyA} style={{ width: "25%" }}>
                    <Dropdown
                        options={[
                            { key: AvailabilityType.No, text: "No" },
                            { key: AvailabilityType.Maybe, text: "Maybe" },
                            { key: AvailabilityType.Yes, text: "Yes" },
                        ]}
                        selectedKey={itemA.availabilityType}
                        onChange={(e, o) => {
                            if (o !== undefined) {
                                personDispatch(
                                    "updateAvailability",
                                    personKey,
                                    {
                                        dateKey: itemA.dateKey,
                                        availabilityType: o.key as number,
                                    },
                                );
                            }
                        }}
                    />
                </div>
            );
        });

        return (
            <Stack className="row" key={personKey} horizontal tokens={{ childrenGap: 10 }}>
                <div className="cell" key="name" style={{ width: "25%" }}>
                    <TextField value={item.name} onChange={(e, v) => personDispatch("updateName", personKey, v)} />
                </div>
                {checkmarks}
            </Stack>
        );
    };

    const onRenderRows = (items: IPersonMap): JSX.Element => {
        const rows = Object.entries(items).map(([personKey, item]) => {
            return onRenderRow(item, personKey);
        });
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
