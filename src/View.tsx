import * as React from "react";
import {
  Stack,
  FocusZone,
  Dropdown,
  initializeIcons,
  TextField,
  FocusZoneDirection,
  IconButton
} from "office-ui-fabric-react";
import { DatePicker, defaultDayPickerStrings } from "@uifabric/date-time";
import { PrimedContext } from "./provider";
import { AvailabilityType, IPersonType, IViewSelectors } from "./View.types";
initializeIcons();

export const ScheduleIt = () => {
  const {
    actions: { setAvailability, setName, setDate, addRow, removeRow },
    selectors: { dates, people }
  } = React.useContext(PrimedContext);

  const onRenderHeader = (dates: IViewSelectors["dates"]) => {
    const content = dates.map((date, i) => {
      return (
        <div className="headerCell" key={i} style={{ width: "25%" }}>
          <DatePicker
            strings={defaultDayPickerStrings}
            value={date}
            onSelectDate={date => setDate(i, date)}
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
              { key: AvailabilityType.Yes, text: "Yes" }
            ]}
            selectedKey={value}
            onChange={(e, o) => {
              setAvailability(key, i, AvailabilityType[o.key]);
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
  return (
    <FocusZone direction={FocusZoneDirection.bidirectional}>
      <Stack tokens={{ childrenGap: 10 }}>
        {onRenderHeader(dates)}
        {onRenderRows(people)}
        <Stack horizontal tokens={{ childrenGap: 10 }}>
          <IconButton
            onClick={() => removeRow()}
            iconProps={{ iconName: "CalculatorSubtract" }}
          />
          <IconButton
            onClick={() => addRow()}
            iconProps={{ iconName: "Add" }}
          />
        </Stack>
      </Stack>
    </FocusZone>
  );
};
