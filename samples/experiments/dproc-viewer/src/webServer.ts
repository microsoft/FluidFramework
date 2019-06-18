/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { HttpServer } from "@prague/services";
import { IWebServer, IWebServerFactory } from "@prague/services-core";
import * as http from "http";

export class WebServer implements IWebServer {
    public webSocketServer = null;

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
    public create(requestListener): IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        return new WebServer(httpServer);
    }
}
