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
import { DatePicker, defaultDayPickerStrings } from "@uifabric/date-time";
import { PrimedContext } from "./provider/provider";
import { AvailabilityType, IPersonType, IViewSelectors } from "./provider";
initializeIcons();

export const ScheduleIt = () => {
  const {
    actions: {
      setAvailability,
      setName,
      setDate,
      addRow,
      removeRow,
      addComment,
    },
    selectors: { dates, people, comments },
  } = React.useContext(PrimedContext);

  const [currentComment, setCurrentComment] = React.useState("");

  const onRenderHeader = (dates: IViewSelectors["dates"]) => {
    const content = dates.map((date, i) => {
      return (
        <div className="headerCell" key={i} style={{ width: "25%" }}>
          <DatePicker
            strings={defaultDayPickerStrings}
            value={date}
            onSelectDate={(date) => setDate(i, date)}
          />
        </div>
      );
    });

    return (
      <Stack className="header" horizontal tokens={{ childrenGap: 10 }}>
        <div className="headerCell" style={{ width: "25%" }}>
          People
        </div>
        {content}
      </Stack>
    );
  };

  const onRenderRows = (items: IViewSelectors["people"]): JSX.Element => {
    const rows = items.map((item, key) => {
      return onRenderRow(item, key);
    });
    return <div className="rows">{rows}</div>;
  };

  const onRenderRow = (item: IPersonType, key: number): JSX.Element => {
    let checkmarks = item.availability.map((value, i) => {
      return (
        <div className="cell" key={i} style={{ width: "25%" }}>
          <Dropdown
            options={[
              { key: AvailabilityType.No, text: "No" },
              { key: AvailabilityType.Maybe, text: "Maybe" },
              { key: AvailabilityType.Yes, text: "Yes" },
            ]}
            selectedKey={value}
            onChange={(e, o) => {
              setAvailability(key, i, o.key);
            }}
          />
        </div>
      );
    });

    return (
      <Stack className="row" key={key} horizontal tokens={{ childrenGap: 10 }}>
        <div className="cell" key="name" style={{ width: "25%" }}>
          <TextField value={item.name} onChange={(e, v) => setName(key, v)} />
        </div>
        {checkmarks}
      </Stack>
    );
  };

  const onRenderComments = (items: IViewSelectors["comments"]): JSX.Element => {
    const comments = items.map((item, key) => {
      return (
        <li>
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
              onChange={(e, v) => setCurrentComment(v)}
              label="Add Comment"
            />
          </Stack.Item>
          <PrimaryButton
            text="Submit"
            onClick={() => {
              addComment("name", currentComment);
              setCurrentComment("");
            }}
          />
        </Stack>
        <ul>{comments}</ul>
      </Stack>
    );
  };
  return (
    <Stack tokens={{ childrenGap: 10 }}>
      <FocusZone direction={FocusZoneDirection.bidirectional}>
        {onRenderHeader(dates)}
        {onRenderRows(people)}
      </FocusZone>

      <Stack horizontal tokens={{ childrenGap: 10 }}>
        <IconButton
          onClick={() => removeRow()}
          iconProps={{ iconName: "CalculatorSubtract" }}
        />
        <IconButton onClick={() => addRow()} iconProps={{ iconName: "Add" }} />
      </Stack>
      {onRenderComments(comments)}
    </Stack>
  );
};
