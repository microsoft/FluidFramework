import * as $ from 'jquery';
import * as _ from 'lodash';
import { pnhost, IEchoService, EchoServiceName, ITableService, TableServiceName, ITableListener } from '../api/index';
var fullcalendar = require('fullcalendar');
var qtip = require('qtip2');

// TODO better wrap this into some kind of model structure
var rowsModel: any[] = [];

class TableListener implements ITableListener {    
    rowsChanged(rows: any[]): Promise<void> {
        // compute the difference between the existing rowsModel and the updates
        let deletedRows = _.filter(rowsModel, (rowModel) => _.find(rows, (row) => row.id === rowModel.id) === undefined);
        $('#calendar').fullCalendar('removeEvents', (event) => {
            return _.find(deletedRows, (deletedRow) => deletedRow.id === event.id);
        });

        // iterate over the deletedRows URLs and delete them
        for (let deletedRow of deletedRows) {
            $.ajax(deletedRow.self, { method: "DELETE" });
            console.log(`DELETE: ${deletedRow.self}`);
        }

        // Update the model with the changed rows
        rowsModel = rows;

        return Promise.resolve();
    }

    rowsSelected(rows: any[]): Promise<void> {
        return Promise.resolve();
    }
}

$(document).ready(() => {
    let tableServiceP: Promise<ITableService>;
    if (pnhost) {
        tableServiceP = pnhost.listServices().then((services) => {
            return _.includes(services, TableServiceName) ? pnhost.getService(TableServiceName) : Promise.resolve(null);
        });
    }
    else {
        tableServiceP = Promise.resolve(null);
    }

    $.ajax("/calendars", {
        cache: false,
        dataType: "json",
        success: (calData: Calendar[]) => {
            if (pnhost) {
                $("#buttons").append($('<button id="load-table">Export to Table</button><button id="save">Save</button>'));
                $("#load-table").click(() => {
                    tableServiceP.then((tableService) => {
                        if (!tableService) {
                            return;
                        }

                        tableService.createTable().then((table) => {
                            let columns = ['provider', 'title', 'location', 'start', 'end', 'responseStatus'];                            
                            for (let calendar of calData) {
                                for (let event of calendar.events) {
                                    rowsModel.push({
                                        id: event.id,
                                        provider: calendar.sourceName,
                                        title: event.title,
                                        location: event.location,
                                        start: event.start,
                                        end: event.end,
                                        responseStatus: event.responseStatus,
                                        self: event.self
                                    })
                                }
                            }

                            table.loadData(columns, rowsModel);

                            // Listen for updates
                            table.addListener(new TableListener());
                        });
                    })
                });
            }

            // page is now ready, initialize the calendar...
            var fcOptions = <FullCalendar.Options>{
                minTime: "07:00:00",
                maxTime: "21:00:00",
                weekends: false,
                height: "auto",
                eventRender: (event, element) => {
                    var content = event.title;
                    if (event.location && (event.location.length > 0)) {
                        content += ("<br/>" + event.location);
                    }
                    if (event.responseStatus && (event.responseStatus.length > 0)) {
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
                var borderColor = (ical == 0) ? "black" : "darkblue";
                var color = (ical == 0) ? "purple" : "green";

                for (var nevent = cal.events.length, iev = 0; iev < nevent; iev++) {
                    let ev = cal.events[iev];
                    events.push({
                        id: ev.id,
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
