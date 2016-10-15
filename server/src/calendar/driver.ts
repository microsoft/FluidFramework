import * as $ from 'jquery';
import * as _ from 'lodash';
import { Promise } from 'es6-promise';
import { pnhost, IEchoService, EchoServiceName, ITable, ITableService, TableServiceName, ITableListener } from '../api/index';
var fullcalendar = require('fullcalendar');
var qtip = require('qtip2');

class TableListener implements ITableListener {
    constructor(private _viewModel: CalendarViewModel) {
    }

    rowsChanged(rows: any[]): Promise<void> {
        this._viewModel.rowsChanged(rows);

        return Promise.resolve();
    }

    rowsSelected(rows: any[]): Promise<void> {
        return Promise.resolve();
    }
}

class RemoteCalendar {
    constructor() {
    }

    getCalendars(): Promise<Calendar[]> {
        return new Promise((resolve, reject) => {
            $.ajax("/calendars", {
                cache: false,
                dataType: "json",
                success: (calData: Calendar[]) => resolve(calData),
                error: (jqXHR: JQueryXHR, textStatus: string, errorThrown: string) => reject(jqXHR)
            });
        });
    }
}

class CalendarViewModel {
    private _calendar = new RemoteCalendar();
    private _tableServiceP: Promise<ITableService>;
    private _cachedCalendars: Calendar[];
    private _pendingDeletes: any[] = [];
    private _tableP: Promise<ITable>;
    private _tableListener: TableListener;
    private _tableBoundRows: any[];

    constructor() {
    }

    private initView() {
        $("#buttons").append($('<div class="fc-right"><div class="fc-button-group"><button id="reload">Reload</button></div></div>'));
        $("#reload").click(() => {
            this.loadAndCacheCalendars();
        });

        if (pnhost) {
            $("#buttons").append($('<div class="fc-left"><div class="fc-button-group"><button id="load-table">Export to Table</button></div></div>'));
            $("#buttons .fc-right .fc-button-group").append('<button id="save">Save</button>');

            // Save processes any pending calendar changes
            $("#save").click(() => {
                // iterate over the deletedRows URLs and delete them
                for (let pendingDelete of this._pendingDeletes) {
                    $.ajax(pendingDelete.self, { method: "DELETE" });
                    console.log(`DELETE: ${pendingDelete.self}`);
                }
            });

            $("#load-table").click(() => {  
                // Disable future loads since we're now bound to the host
                $("#load-table").prop('disabled', true);

                this.loadPNHostTable();
            });
        }        

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
            
        $('#calendar').fullCalendar(fcOptions);
        $('#calendar').fullCalendar('changeView', 'agendaWeek');
    }

    private loadPNHostTable() {
        if (!this._tableP) {
            this._tableP = this._tableServiceP.then((tableService) => tableService.createTable());
        }

        this._tableP.then((table) => {
            let columns = ['provider', 'title', 'location', 'start', 'end', 'responseStatus'];

            // Get and store the rows we will bind to the pnhost table
            this._tableBoundRows = [];
            for (let calendar of this._cachedCalendars) {
                for (let event of calendar.events) {
                    this._tableBoundRows.push({
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

            // Load the rows into the hosted table
            table.loadData(columns, this._tableBoundRows);

            // Setup a table listener if it doesn't already exist 
            if (!this._tableListener) {
                this._tableListener = new TableListener(this);
                table.addListener(this._tableListener);
            }
        })
    }

    private loadAndCacheCalendars(): Promise<Calendar[]> {
        return this._calendar.getCalendars().then((calendars) => {
            // Clear any pending deletes - a reload resets any interactions 
            this._pendingDeletes = [];

            // Initialize the custom UI once we load the first batch of data
            if (this._cachedCalendars === undefined) {
                this.initView();
            }                

            this._cachedCalendars = calendars;
            
            // Update the calendar UI
            this.loadCalendarView(calendars);

            // Refresh the pnhost table with the new fields
            if (this._tableP) {
                this.loadPNHostTable();
            }        

            return calendars;
        })
    }

    rowsChanged(rows: any[]) {
        // compute the difference between the received rows and the bound data
        let deletedRows = _.filter(this._tableBoundRows, (rowModel) => _.find(rows, (row) => row.id === rowModel.id) === undefined);
        $('#calendar').fullCalendar('removeEvents', (event) => {
            return _.find(deletedRows, (deletedRow) => deletedRow.id === event.id);
        });

        // Add the rows to delete to the pending list
        this._pendingDeletes = this._pendingDeletes.concat(deletedRows);

        // Update the bound data values
        this._tableBoundRows = rows;
    }

    private loadCalendarView(calendars: Calendar[]) {
        var events: FullCalendar.EventObject[] = [];
        for (var ncal = calendars.length, ical = 0; ical < ncal; ical++) {
            var cal = calendars[ical];
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

        // Update the calendar view
        $('#calendar').fullCalendar('removeEvents');
        for (let event of events) {
            $('#calendar').fullCalendar('renderEvent', event);
        }
    }

    init() {
        if (pnhost) {
            this._tableServiceP = pnhost.listServices().then((services) => {
                return _.includes(services, TableServiceName) ? pnhost.getService(TableServiceName) : Promise.resolve(null);
            });
        }
        else {
            this._tableServiceP = Promise.resolve(null);
        }

        $(document).ready(() => {
            this.loadAndCacheCalendars();            
        });
    }
}

// Create and initialize the view model that will bind to and run the UI
let viewModel = new CalendarViewModel();
viewModel.init();