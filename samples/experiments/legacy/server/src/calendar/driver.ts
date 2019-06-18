/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Promise } from "es6-promise";
import * as fullcalendar from "fullcalendar";
import * as $ from "jquery";
import * as _ from "lodash";
import * as moment from "moment";
import * as qtip from "qtip2";
import {
    EchoServiceName,
    IEchoService,
    ITable,
    ITableListener,
    ITableService,
    pnhost,
    TableServiceName,
} from "../api/index";
import { ICalendar, ICalendarEvent } from "./interfaces";

// The TypeScript compiler will elide these two libraries since they aren"t directly accessed.
// They are jquery plugins and so internally attach themselves to the $ object. We do the import
// below to force their inclusion while also keeping the version above to get the typing information
import "fullcalendar";
import "qtip2";

// TODO split into multiple files
// tslint:disable:max-classes-per-file

class TableListener implements ITableListener {
    constructor(private viewModel: CalendarViewModel) {
    }

    public rowsChanged(rows: any[]): Promise<void> {
        this.viewModel.rowsChanged(rows);

        return Promise.resolve();
    }

    public rowsSelected(rows: any[]): Promise<void> {
        return Promise.resolve();
    }
}

class RemoteCalendar {
    public getCalendars(): Promise<ICalendar[]> {
        return new Promise((resolve, reject) => {
            $.ajax("/calendars", {
                cache: false,
                dataType: "json",
                error: (jqXHR: JQueryXHR, textStatus: string, errorThrown: string) => reject(jqXHR),
                success: (calData: ICalendar[]) => resolve(calData),
            });
        });
    }
}

class CalendarViewModel {
    private calendar = new RemoteCalendar();
    private tableServiceP: Promise<ITableService>;
    private cachedCalendars: ICalendar[];
    private pendingDeletes: any[] = [];
    private tableP: Promise<ITable>;
    private tableListener: TableListener;
    private tableBoundRows: any[];

    public init() {
        if (pnhost) {
            this.tableServiceP = pnhost.listServices().then((services) => {
                return _.includes(services, TableServiceName)
                    ? pnhost.getService(TableServiceName)
                    : Promise.resolve(null);
            });
        } else {
            this.tableServiceP = Promise.resolve(null);
        }

        $(document).ready(() => {
            this.loadAndCacheCalendars();
        });
    }

    public rowsChanged(rows: any[]) {
        // compute the difference between the received rows and the bound data
        let deletedRows = _.filter(
            this.tableBoundRows,
            (rowModel) => _.find(rows, (row) => row.id === rowModel.id) === undefined);
        $("#calendar").fullCalendar("removeEvents", (event) => {
            return _.find(deletedRows, (deletedRow) => deletedRow.id === event.id);
        });

        // Add the rows to delete to the pending list
        this.pendingDeletes = this.pendingDeletes.concat(deletedRows);

        // Update the bound data values
        this.tableBoundRows = rows;
    }

    private initView() {
        // tslint:disable-next-line:max-line-length
        $("#buttons").append($('<div class="fc-right"><div class="fc-button-group"><button id="reload" class="fc-button fc-state-default" type="button">Reload</button></div></div>'));
        $("#reload").click(() => {
            this.loadAndCacheCalendars();
        });

        if (pnhost) {
            // tslint:disable-next-line:max-line-length
            $("#buttons").append($('<div class="fc-left"><div class="fc-button-group"><button id="load-table" class="fc-button fc-state-default" type="button">Export to Table</button></div></div>'));
            $("#buttons .fc-right .fc-button-group").append('<button id="save" class="fc-button fc-state-default" type="button">Save</button>');

            // Save processes any pending calendar changes
            $("#save").click(() => {
                // iterate over the deletedRows URLs and delete them
                for (let pendingDelete of this.pendingDeletes) {
                    $.ajax(pendingDelete.self, { method: "DELETE" });
                }
            });

            $("#load-table").click(() => {
                // Disable future loads since we"re now bound to the host
                $("#load-table").prop("disabled", true);

                this.loadPNHostTable();
            });
        }

        let fcOptions: any = {
            eventRender: (event, element) => {
                let content = event.title;
                if (event.location && (event.location.length > 0)) {
                    content += ("<br/>" + event.location);
                }
                if (event.responseStatus && (event.responseStatus.length > 0)) {
                    content += ("<br/>" + event.responseStatus);
                }
                let qtipOptions = {
                    content,
                    position: {
                        at: "center",
                        my: "left center",
                    },
                };
                element.qtip(qtipOptions);
            },
            height: "auto",
            maxTime: "21:00:00",
            minTime: "07:00:00",
            weekends: false,
        };

        $("#calendar").fullCalendar(fcOptions as fullcalendar.Options);
        $("#calendar").fullCalendar("changeView", "agendaWeek");
    }

    private loadPNHostTable() {
        if (!this.tableP) {
            this.tableP = this.tableServiceP.then((tableService) => tableService.createTable());
        }

        this.tableP.then((table) => {
            // Longer term we should standardize on some format here so there
            // isn't a disconnect between Office and moment
            const columnTimeFormatString = "m/d/yy h:mm AM/PM";
            let columns = [
                { name: "id", format: null },
                { name: "provider", format: null },
                { name: "title", format: null },
                { name: "location", format: null },
                { name: "start", format: columnTimeFormatString },
                { name: "end", format: columnTimeFormatString },
                { name: "responseStatus", format: null },
            ];

            // Get and store the rows we will bind to the pnhost table -
            // we convert times to a format easier to parse by hosts (i.e. Excel)
            const formatString = "M/D/YY h:mm A";
            this.tableBoundRows = [];
            for (let calendar of this.cachedCalendars) {
                for (let event of calendar.events) {
                    this.tableBoundRows.push({
                        end: moment(event.end).format(formatString),
                        id: event.id,
                        location: event.location,
                        provider: calendar.sourceName,
                        responseStatus: event.responseStatus,
                        self: event.self,
                        start: moment(event.start).format(formatString),
                        title: event.title,
                    });
                }
            }

            // Load the rows into the hosted table
            table.loadData(columns, this.tableBoundRows);

            // Setup a table listener if it doesn"t already exist
            if (!this.tableListener) {
                this.tableListener = new TableListener(this);
                table.addListener(this.tableListener);
            }
        });
    }

    private loadAndCacheCalendars(): Promise<ICalendar[]> {
        return this.calendar.getCalendars().then((calendars) => {
            // Clear any pending deletes - a reload resets any interactions
            this.pendingDeletes = [];

            // Initialize the custom UI once we load the first batch of data
            if (this.cachedCalendars === undefined) {
                this.initView();
            }

            this.cachedCalendars = calendars;

            // Update the calendar UI
            this.loadCalendarView(calendars);

            // Refresh the pnhost table with the new fields
            if (this.tableP) {
                this.loadPNHostTable();
            }

            return calendars;
        });
    }

    private loadCalendarView(calendars: ICalendar[]) {
        let events: fullcalendar.EventObject[] = [];
        for (let ncal = calendars.length, ical = 0; ical < ncal; ical++) {
            let cal = calendars[ical];
            let borderColor = (ical === 0) ? "black" : "darkblue";
            let color = (ical === 0) ? "purple" : "green";

            for (let nevent = cal.events.length, iev = 0; iev < nevent; iev++) {
                let ev = cal.events[iev];
                let event: any = {
                    borderColor,
                    color,
                    end: new Date(ev.end),
                    id: ev.id,
                    location: ev.location,
                    responseStatus: ev.responseStatus,
                    start: new Date(ev.start),
                    title: ev.title,
                };

                events.push(event);
            }
        }

        // Update the calendar view
        $("#calendar").fullCalendar("removeEvents");
        for (let event of events) {
            $("#calendar").fullCalendar("renderEvent", event);
        }
    }
}

// Create and initialize the view model that will bind to and run the UI
let viewModel = new CalendarViewModel();
viewModel.init();
