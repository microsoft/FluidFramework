export var EchoServiceName = "echo";

/**
 * Simple interface to echo a message between the client and the server
 */
export interface IEchoService {
    echo(data: string): Promise<string>;
}

export var TableServiceName = "table";

/**
 * Host service to provide access to table functionality
 */
export interface ITableService {
    createTable(): Promise<ITable>;
}

/**
 * Table access interface
 */
export interface ITable {
    loadData(columns: string[], rows: any[]): Promise<void>;
}