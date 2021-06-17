/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import { AddressInfo } from "net";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import * as socketIo from "./socketIoServer";

export type RequestListener = (request: http.IncomingMessage, response: http.ServerResponse) => void;

export class HttpServer implements core.IHttpServer {
    constructor(private readonly server: http.Server) {
    }

    public async close(): Promise<void> {
        await util.promisify(((callback) => this.server.close(callback)) as any)();
    }

    public listen(port: any) {
        this.server.listen(port);
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.server.on(event, listener);
    }

    public address(): AddressInfo {
        return this.server.address() as AddressInfo;
    }
}

export class WebServer implements core.IWebServer {
    constructor(public httpServer: HttpServer, public webSocketServer: core.IWebSocketServer) {
    }

    /**
     * Closes the web server
     */
    public async close(): Promise<void> {
        await Promise.all([
            this.httpServer.close(),
            this.webSocketServer ? this.webSocketServer.close() : Promise.resolve()]);
    }
}

export class SocketIoWebServerFactory implements core.IWebServerFactory {
    constructor(private readonly redisConfig: any, private readonly socketIoAdapterConfig?: any) {
    }

    public create(requestListener: RequestListener): core.IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        const socketIoServer = socketIo.create(this.redisConfig, server, this.socketIoAdapterConfig);

        return new WebServer(httpServer, socketIoServer);
    }
}

export class BasicWebServerFactory implements core.IWebServerFactory {
    public create(requestListener: RequestListener): core.IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        return new WebServer(httpServer, null);
    }
}
