interface CalendarEvent {
    title: string;
    start: string;
    end: string;
    location: string;
    responseStatus: string;
}

interface Calendar {
    events: CalendarEvent[];
    sourceName: string;
}

