/// <reference path="fullCalendar.d.ts" />

interface CalendarEventJSON {
    summary: string;
    start: string;
    end: string;
}

$(document).ready(function () {

    $.ajax("/calendars", {
        cache: false, 
        dataType: "json",
        success: function (calData) {

            // page is now ready, initialize the calendar...
            var fcOptions = <FullCalendar.Options>{
                minTime: "07:00:00",
                maxTime: "21:00:00",
                weekends: false,
                height: "auto",
            };

            var calArray = calData._embedded.item;
            var events: FullCalendar.EventObject[] = [];
            for (var ncal = calArray.length, ical = 0; ical < ncal; ical++) {
                var cal = calArray[ical];
                var eventArray = cal._embedded.item;
                var borderColor = (ical==0)?"black":"darkblue";
                var color = (ical==0)?"purple":"green";
        
                for (var nevent = eventArray.length, iev = 0; iev < nevent; iev++) {
                    let ev = <CalendarEventJSON>(eventArray[iev]);
                    events.push({
                        title: ev.summary,
                        color: color,
                        borderColor: borderColor,
                        start: new Date(ev.start),
                        end: new Date(ev.end),
                    });
                }
            }
            fcOptions.events = events;
            $('#calendar').fullCalendar(fcOptions);
            $('#calendar').fullCalendar('changeView', 'agendaWeek');
        }
    });
});
