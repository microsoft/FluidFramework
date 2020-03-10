import * as React from "react";
import { ScheduleIt } from "./View";
import { PrimedContext } from "./provider";
import {
  IViewActions,
  IViewSelectors,
  AvailabilityType
} from "./provider.types";

export const App = () => {
  // Default Dates
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);
  const defaultDates: IViewSelectors["dates"] = [today, tomorrow, dayAfter];

  // Default People
  const defaultPeople: IViewSelectors["people"] = [
    {
      name: "Bruno",
      availability: [
        AvailabilityType.No,
        AvailabilityType.Maybe,
        AvailabilityType.Yes
      ]
    },
    {
      name: "Tamine",
      availability: [
        AvailabilityType.No,
        AvailabilityType.Maybe,
        AvailabilityType.Yes
      ]
    },
    {
      name: "Jodom",
      availability: [
        AvailabilityType.No,
        AvailabilityType.Maybe,
        AvailabilityType.Yes
      ]
    },
    {
      name: "Michelle",
      availability: [
        AvailabilityType.No,
        AvailabilityType.Maybe,
        AvailabilityType.Yes
      ]
    }
  ];

  // Default Comments
  const defaultComments = [];

  // Comments Reducer
  const commentsReducer: React.Reducer<any, any> = (state, action) => {
    let newState = [...state];
    switch (action.type) {
      case "add":
        newState.push({ name: action.name, message: action.message });
        break;
    }
    return newState;
  };

  // Date reducer
  const dateReducer: React.Reducer<Date[], { key: number; date: Date }> = (
    state,
    action
  ) => {
    const newState = [...state];
    newState[action.key] = action.date;
    return newState;
  };

  // People Reducer
  const peopleReducer: React.Reducer<IViewSelectors["people"], any> = (
    state,
    action
  ) => {
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
  const [dates, updateDate] = React.useReducer(dateReducer, defaultDates);
  const [people, updatePerson] = React.useReducer(peopleReducer, defaultPeople);
  const [comments, updateComments] = React.useReducer(
    commentsReducer,
    defaultComments
  );

  // Actions

  const addComment: IViewActions["addComment"] = (name, message) => {
    updateComments({
      type: "add",
      name,
      message
    });
  };
  const setDate: IViewActions["setDate"] = (dateKey, date) => {
    updateDate({
      key: dateKey,
      date: date
    });
  };

  const setAvailability: IViewActions["setAvailability"] = (
    personKey,
    dayKey,
    availability
  ) => {
    updatePerson({
      type: "availability",
      personKey: personKey,
      dayKey: dayKey,
      availability: availability
    });
  };

  const setName: IViewActions["setName"] = (personKey, name) => {
    updatePerson({
      type: "name",
      personKey: personKey,
      name: name
    });
  };

  const addRow: IViewActions["addRow"] = () => {
    updatePerson({
      type: "add"
    });
  };
  const removeRow: IViewActions["removeRow"] = () => {
    updatePerson({
      type: "remove"
    });
  };

  const actions = {
    setAvailability,
    setName,
    setDate,
    addRow,
    removeRow,
    addComment
  };
  const selectors = { dates, people, comments };

  return (
    <PrimedContext.Provider value={{ actions, selectors }}>
      <ScheduleIt />
    </PrimedContext.Provider>
  );
};
