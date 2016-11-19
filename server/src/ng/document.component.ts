import { Component, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { InteractiveDocumentViewService } from './interactive-document-view.service';
import { InteractiveDocumentService } from './interactive-document.service';
import { ViewModel, IViews, IView, Resource } from '../interfaces';
import { PostMessageHostServer, ITableColumn, EchoServiceName, TableServiceName, ITableService, ITable, ITableListener } from '../api/index';
import * as services from '../services/index';
import {
    Angular2DataTableModule,                
    ColumnMode,
    SelectionType
} from 'angular2-data-table';
import * as _ from 'lodash';

class Table implements ITable {    
    rows: any[];
    columns: any[];    
    selected: any[] = []
    private _listeners: ITableListener[] = [];
    
    loadData(columns: ITableColumn[], rows: any[]): Promise<void> {
        console.log('load data');
        this.columns = columns.map((column) => ({prop: column.name}));
        this.selected = [];
        this.rows = rows;

        return Promise.resolve();
    }

    onSelectionChange(event: any) { 
        this.selected = event.selected;              
        for (let listener of this._listeners) {
            listener.rowsSelected(event.selected);
        }        
    }

    onSelectionDeleted() {
        this.rows = _.filter(this.rows, (row) => !_.includes(this.selected, row));
        for (let listener of this._listeners) {
            listener.rowsChanged(this.rows);
        }
    }

    addListener(listener: ITableListener): Promise<void> {   
        this._listeners.push(listener);
        return Promise.resolve();     
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