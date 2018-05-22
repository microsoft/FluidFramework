import * as core from "@prague/routerlicious/dist/core";
import * as http from "http";
import * as util from "util";

export type RequestListener = (request: http.IncomingMessage, response: http.ServerResponse) => void;

export interface IWebServerFactory {
    create(requestListener: RequestListener): IWebServer;
}

export interface IWebServer {
    /**
     * HTTP server interface
     */
    httpServer: core.IHttpServer;

    /**
     * Closes the web server
     */
    close(): Promise<void>;
}

export class HttpServer implements core.IHttpServer {
    constructor(private server: http.Server) {
    }

    public async close(): Promise<void> {
        // tslint:disable-next-line
        await util.promisify(((callback) => this.server.close(callback)) as Function)();
    }

    public listen(port: any) {
        this.server.listen(port);
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.server.on(event, listener);
    }

    public address(): { port: number; family: string; address: string; } {
        return this.server.address();
    }
}

export class WebServer implements IWebServer {
    constructor(public httpServer: HttpServer) {
    }

    /**
     * Closes the web server
     */
    public async close(): Promise<void> {
        await this.httpServer.close();
    }
}

export class WebServerFactory implements IWebServerFactory {

    public create(requestListener: RequestListener): IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        return new WebServer(httpServer);
    }
}
