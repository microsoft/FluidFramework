import * as React from "react";
import {
  Stack,
  FocusZone,
  Checkbox,
  initializeIcons,
  FocusZoneDirection
} from "office-ui-fabric-react";
initializeIcons();

export interface IAppProps {
  dates: { date: string }[];
  people: {
    name: string;
    availability: boolean[];
  }[];
}

const {setDate(id, date), setPeople(key, name, availability[0, 1, 2])} = action;

const {getDates, getPeople: {name, availability[]}} = selectors;

const appProps: IAppProps = {
  dates: [
    { date: "Monday 3pm" },
    { date: "Tuesday 9am" },
    { date: "Wednesday 4pm" }
  ],
  people: [
    {
      name: "Bruno",
      availability: [false, true, true]
    },
    {
      name: "Tamine",
      availability: [false, true, true]
    },
    {
      name: "Jodom",
      availability: [false, true, true]
    },
    {
      name: "Michelle",
      availability: [false, true, true]
    }
  ]
};

export const App = () => {
  const { dates, people } = appProps;

  const onRenderHeader = (columns: IAppProps["dates"]) => {
    const content = columns.map((column, i) => {
      return (
        <div className="headerCell" key={i} style={{ width: "25%" }}>
          {column.date}
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
          <Checkbox value={value} />
        </div>
      );
    });

    return (
      <Stack className="row" key={key} horizontal tokens={{ childrenGap: 10 }}>
        <div className="cell" key="name" style={{ width: "25%" }}>
          {item.name}
        </div>
        {checkmarks}
      </Stack>
    );
  };
  return (
    <FocusZone direction={FocusZoneDirection.bidirectional}>
      <Stack>
        {onRenderHeader(dates)}
        {onRenderRows(people)}
      </Stack>
    </FocusZone>
  );
};
