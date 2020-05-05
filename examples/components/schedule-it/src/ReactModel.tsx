import * as React from "react";
import { ScheduleIt } from "./View";
import { defaultDates, defaultPeople } from "./utils";
import {
  IViewActions,
  IViewSelectors,
  AvailabilityType,
  PrimedContext,
} from "./provider";

export const App = () => {
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
          name: action.name,
        };
        newState[action.personKey] = newPerson;
        break;
      case "availability":
        const person = newState[action.personKey];
        person.availability[action.dayKey] = action.availability;

        newState[action.personKey] = person;
        break;
      case "add":
        newState.push({
          name: "",
          availability: [
            AvailabilityType.No,
            AvailabilityType.No,
            AvailabilityType.No,
          ],
        });
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
      message,
    });
  };
  const setDate: IViewActions["setDate"] = (dateKey, date) => {
    updateDate({
      key: dateKey,
      date: date,
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
      availability: availability,
    });
  };

  const setName: IViewActions["setName"] = (personKey, name) => {
    updatePerson({
      type: "name",
      personKey: personKey,
      name: name,
    });
  };

  const addRow: IViewActions["addRow"] = () => {
    updatePerson({
      type: "add",
    });
  };
  const removeRow: IViewActions["removeRow"] = () => {
    updatePerson({
      type: "remove",
    });
  };

  const actions = {
    setAvailability,
    setName,
    setDate,
    addRow,
    removeRow,
    addComment,
  };
  const selectors = { dates, people, comments };

  return (
    <PrimedContext.Provider value={{ actions, selectors }}>
      <ScheduleIt />
    </PrimedContext.Provider>
  );
};
