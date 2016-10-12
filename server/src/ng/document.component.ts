import { Component, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { InteractiveDocumentViewService } from './interactive-document-view.service';
import { InteractiveDocumentService } from './interactive-document.service';
import { ViewModel, IViews, IView, Resource } from '../interfaces';
import { PostMessageHostServer, EchoServiceName, TableServiceName, ITableService, ITable } from '../api/index';
import * as services from '../services/index';
import {
    Angular2DataTableModule,
    TableOptions,
    TableColumn,
    ColumnMode,
    SelectionType
} from 'angular2-data-table';

interface Table {
    options: TableOptions;
    rows: any[];
}

class Table implements ITable {
    options: TableOptions;
    rows: any[];
    selections: any[] = [];
    
    loadData(columns: string[], rows: any[]): Promise<void> {
        console.log('load data');
        let columnOptions = columns.map((column) => new TableColumn({prop: column}));

        this.options = new TableOptions({
            columnMode: ColumnMode.force,
            headerHeight: 50,
            footerHeight: 50,
            rowHeight: 'auto',
            selectionType: SelectionType.multi,
            columns: columnOptions
        });

        this.rows = rows;

        return Promise.resolve();
    }

    onSelectionChange(event: any) {
        console.log('something was selected');
        console.log(JSON.stringify(event));
    }
}

class TableService implements ITableService {
    tables: ITable[] = [];

    createTable(): Promise<ITable> {
        let table = new Table();
        this.tables.push(table);
        return Promise.resolve(table);
    }
}

@Component({
    selector: 'interactive-document',
    templateUrl: 'templates/document.component.html',
    providers: [InteractiveDocumentService, InteractiveDocumentViewService]
})
export class DocumentComponent implements OnInit {
    // Loading flag for the document    
    loaded: boolean = false;

    url: string;

    tableService = new TableService();

    // The hosting server - this should probably be a shared angular service but keeping simple for now
    private _server = new PostMessageHostServer(window);

    constructor(
        private documentService: InteractiveDocumentService,
        private viewService: InteractiveDocumentViewService) {
    }

    ngOnInit() {
        this._server.addService(EchoServiceName, new services.BrowserEchoService());
        this._server.addService(TableServiceName, this.tableService);
        this._server.start();
    }

    load(url: string): void {
        this.url = url;
        this.loaded = true;
    }
}