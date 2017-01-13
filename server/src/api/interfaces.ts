import { Promise } from "es6-promise";

export const EchoServiceName = "echo";

/**
 * Simple interface to echo a message between the client and the server
 */
export interface IEchoService {
    echo(data: string): Promise<string>;
}

export const TableServiceName = "table";

/**
 * Host service to provide access to table functionality
 */
export interface ITableService {
    createTable(): Promise<ITable>;
}

/**
 * Listener interface to receive table updates
 */
export interface ITableListener {
    rowsChanged(rows: any[]): Promise<void>;

    rowsSelected(rows: any[]): Promise<void>;
}

export interface ITableColumn {
    name: string;

    format: string;
}

/**
 * Table access interface
 */
export interface ITable {
    loadData(columns: ITableColumn[], rows: any[]): Promise<void>;

    addListener(listener: ITableListener): Promise<void>;
}
