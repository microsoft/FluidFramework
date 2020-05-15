/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDefaultPersonMap,
    IDefaultDateMap,
    IComment,
    AvailabilityType,
} from "../interface";

const today = new Date();
const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
const dayAfter = new Date(today.getTime() + 24 * 60 * 60 * 1000 * 2);

export const defaultComments: IComment[] = [];

export const defaultDates: IDefaultDateMap = {
    today: {
        key: "today",
        date: today,
    },
    tomorrow: {
        key: "tomorrow",
        date: tomorrow,
    },
    dayAfter: {
        key: "dayAfter",
        date: dayAfter,
    },
};

export const defaultPeople: IDefaultPersonMap = {
    1: {
        key: "1",
        name: "Bruno",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailabilityType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.Maybe },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.Maybe },
        },
    },
    2: {
        key: "2",
        name: "Tamine",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailabilityType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.Yes },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.No },
        },
    },
    3: {
        key: "3",
        name: "Jodom",
        availabilityMap: {
            today: { dateKey: "today",  availabilityType: AvailabilityType.Maybe },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.No },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.Yes },
        },
    },
    4: {
        key: "4",
        name: "Michelle",
        availabilityMap: {
            today: { dateKey: "today", availabilityType: AvailabilityType.Yes },
            tomorrow: { dateKey: "tomorrow", availabilityType: AvailabilityType.No },
            dayAfter: { dateKey: "dayAfter", availabilityType: AvailabilityType.Maybe },
        },
    },
};
