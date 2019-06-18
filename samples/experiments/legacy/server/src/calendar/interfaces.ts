/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ICalendarEvent {
    id: string;
    self: string;
    title: string;
    start: string;
    end: string;
    location: string;
    responseStatus: string;
};

export interface ICalendar {
    events: ICalendarEvent[];
    sourceName: string;
};
