/// <reference path="fullCalendar.d.ts" />
/// <reference path="..\..\server\src\routes\calendar.d.ts" />

$(document).ready(function () {

    $.ajax("/calendars", {
        cache: false, 
        dataType: "json",
        success: function (calData: Calendar[]) {
            // page is now ready, initialize the calendar...
            var fcOptions = <FullCalendar.Options>{
                minTime: "07:00:00",
                maxTime: "21:00:00",
                weekends: false,
                height: "auto",
                eventRender: (event, element) => {
                    var content = event.title;
                    if (event.location && (event.location.length>0)) {
                        content += ("<br/>" + event.location);
                    }
                    if (event.responseStatus && (event.responseStatus.length>0)) {
                        content += ("<br/>" + event.responseStatus);
                    }
                    var qtipOptions: QTip2.QTipOptions = {
                        content: content,
                        position: {
                            my: "left center",
                            at: "center"
                        }
                    };
                    element.qtip(qtipOptions);
                }
            };

            var events: FullCalendar.EventObject[] = [];
            for (var ncal = calData.length, ical = 0; ical < ncal; ical++) {
                var cal = calData[ical];
                var borderColor = (ical==0)?"black":"darkblue";
                var color = (ical==0)?"purple":"green";
        
                for (var nevent = cal.events.length, iev = 0; iev < nevent; iev++) {
                    let ev = cal.events[iev];
                    events.push({
                        title: ev.title,
                        color: color,
                        borderColor: borderColor,
                        location: ev.location,
                        responseStatus: ev.responseStatus,
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
