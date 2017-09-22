import * as http from "http";

export interface IWebServerFactory {
    create(requestListener: (request: http.IncomingMessage, response: http.ServerResponse) => void): IWebServer;
}

export interface IWebSocket {
    on(event: string, listener: (...args: any[]) => void);

    join(id: string): Promise<void>;
}

export interface IWebServer {
    /**
     * Web socket interface
     */
    webSocketServer: IWebSocketServer;

    /**
     * HTTP server interface
     */
    httpServer: IHttpServer;

    /**
     * Closes the web server
     */
    close(): Promise<void>;
}

export interface IWebSocketServer {
    on(event: string, listener: (...args: any[]) => void);
}

export interface IHttpServer {
    listen(port: any): void;

    on(event: string, listener: (...args: any[]) => void);

    address(): { port: number; family: string; address: string; };
}
