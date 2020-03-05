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
initializeIcons();

export interface IAppProps {
  dates: Date[];
  people: {
    name: string;
    availability: boolean[];
  }[];
}

// const {setDate(id, date), setPeople(key, name, availability[0, 1, 2])} = action;

// const {getDates, getPeople: {name, availability[]}} = selectors;

export const App = () => {
  // Dates
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);
  const defaultDates = [today, tomorrow, dayAfter];
  const setDateReducer = (
    state: Date[],
    action: { key: number; date: Date }
  ): Date[] => {
    const newState = [...state];
    newState[action.key] = action.date;
    return newState;
  };

  // People
  const defaultPeople = [
    {
      name: "Bruno",
      availability: [0, 1, 2]
    },
    {
      name: "Tamine",
      availability: [0, 1, 2]
    },
    {
      name: "Jodom",
      availability: [0, 1, 2]
    },
    {
      name: "Michelle",
      availability: [0, 1, 2]
    }
  ];

  const setPeopleReducer = (state, action) => {
    let newState = [...state];
    switch (action.type) {
      case "name":
        const newPerson = {
          ...state[action.personKey],
          name: action.name
        };
        newState[action.personKey] = newPerson;
        break;
      case "availability":
        const person = newState[action.personKey];
        person.availability[action.dayKey] = action.availability;

        newState[action.personKey] = person;
        break;
      case "add":
        newState.push({ name: "", availability: [0, 0, 0] });
        break;
      case "remove":
        newState.pop();
        break;
    }

    return newState;
  };

  // Reducers
  const [dates, setDate] = React.useReducer(setDateReducer, defaultDates);
  const [people, setPerson] = React.useReducer(setPeopleReducer, defaultPeople);

  const setAvailability = (personKey, dayKey, availability) => {
    setPerson({
      type: "availability",
      personKey: personKey,
      dayKey: dayKey,
      availability: availability
    });
  };

  const setName = (personKey, name) => {
    setPerson({
      type: "name",
      personKey: personKey,
      name: name
    });
  };

  const addRow = () => {
    setPerson({
      type: "add"
    });
  };
  const removeRow = () => {
    setPerson({
      type: "remove"
    });
  };
  const actions = { setAvailability, setName, setDate, addRow, removeRow };
  const selectors = { dates, people };
  return (
    <PrimedContext.Provider value={{ actions, selectors }}>
      <ScheduleIt />
    </PrimedContext.Provider>
  );
};

const ScheduleIt = () => {
  const {
    actions: { setAvailability, setName, setDate, addRow, removeRow },
    selectors: { dates, people }
  } = React.useContext(PrimedContext);

  const onRenderHeader = (dates: IAppProps["dates"]) => {
    const content = dates.map((date, i) => {
      return (
        <div className="headerCell" key={i} style={{ width: "25%" }}>
          <DatePicker
            strings={defaultDayPickerStrings}
            value={date}
            onSelectDate={d => setDate({ key: i, date: d })}
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

  const onRenderRows = (items: IAppProps["people"]): JSX.Element => {
    const rows = items.map((item, key) => {
      return onRenderRow(item, key);
    });
    return <div className="rows">{rows}</div>;
  };

  const onRenderRow = (item, key): JSX.Element => {
    let checkmarks = item.availability.map((value, i) => {
      return (
        <div className="cell" key={i} style={{ width: "25%" }}>
          <Dropdown
            options={[
              { key: 0, text: "No" },
              { key: 1, text: "Maybe" },
              { key: 2, text: "Yes" }
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
