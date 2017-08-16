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
