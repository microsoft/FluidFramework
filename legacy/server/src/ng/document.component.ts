import { Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";
import {
    Angular2DataTableModule,
    ColumnMode,
    SelectionType,
} from "angular2-data-table";
import * as _ from "lodash";
import {
    EchoServiceName,
    ITable,
    ITableColumn,
    ITableListener,
    ITableService,
    PostMessageHostServer,
    TableServiceName,
} from "../api/index";
import { IResource, IView, IViewModel, IViews } from "../interfaces";
import * as services from "../services/index";
import { InteractiveDocumentViewService } from "./interactive-document-view.service";
import { InteractiveDocumentService } from "./interactive-document.service";

// TODO split into multiple files
// tslint:disable:max-classes-per-file

class Table implements ITable {
    public rows: any[];
    public columns: any[];
    public selected: any[] = [];
    private listeners: ITableListener[] = [];

    public loadData(columns: ITableColumn[], rows: any[]): Promise<void> {
        this.columns = columns.map((column) => ({ prop: column.name }));
        this.selected = [];
        this.rows = rows;

        return Promise.resolve();
    }

    public onSelectionChange(event: any) {
        this.selected = event.selected;
        for (let listener of this.listeners) {
            listener.rowsSelected(event.selected);
        }
    }

    public onSelectionDeleted() {
        this.rows = _.filter(this.rows, (row) => !_.includes(this.selected, row));
        for (let listener of this.listeners) {
            listener.rowsChanged(this.rows);
        }
    }

    public addListener(listener: ITableListener): Promise<void> {
        this.listeners.push(listener);
        return Promise.resolve();
    }
}

class TableService implements ITableService {
    public tables: ITable[] = [];

    public createTable(): Promise<ITable> {
        let table = new Table();
        this.tables.push(table);
        return Promise.resolve(table);
    }
}

@Component({
    providers: [InteractiveDocumentService, InteractiveDocumentViewService],
    selector: "interactive-document",
    templateUrl: "templates/document.component.html",
})
export class DocumentComponent implements OnInit {
    // Loading flag for the document
    public loaded: boolean = false;

    public url: string;

    public tableService = new TableService();

    // The hosting server - this should probably be a shared angular service but keeping simple for now
    private server = new PostMessageHostServer(window);

    constructor(
        private documentService: InteractiveDocumentService,
        private viewService: InteractiveDocumentViewService) {
    }

    public ngOnInit() {
        this.server.addService(EchoServiceName, new services.BrowserEchoService());
        this.server.addService(TableServiceName, this.tableService);
        this.server.start();
    }

    public load(url: string): void {
        this.url = url;
        this.loaded = true;
    }
}
