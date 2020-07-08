/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDatePickerStrings } from "office-ui-fabric-react";

export const today = new Date();
export const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
export const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);

export const defaultDates =  new Map([
    ["today", today],
    ["tomorrow", tomorrow],
    ["dayAfter", dayAfter],
]);

export const DayPickerStrings: IDatePickerStrings = {
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],

    shortMonths: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],

    days: [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],

    shortDays: [
      "S",
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
    ],

    goToToday: "Go to today",
    prevMonthAriaLabel: "Go to previous month",
    nextMonthAriaLabel: "Go to next month",
    prevYearAriaLabel: "Go to previous year",
    nextYearAriaLabel: "Go to next year",

    isRequiredErrorMessage: "Start date is required.",
    invalidInputErrorMessage: "Invalid date format.",
  };
