/**
 * Simple interface to echo a message between the client and the server
 */
export interface IEchoService {
    echo(data: string): Promise<string>;
}

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
}

/**
 * Host interface to provide access to view rendering services
 */
export interface IRenderService {
}