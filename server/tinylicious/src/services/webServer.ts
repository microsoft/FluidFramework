/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { HttpServer } from "@fluidframework/server-services";
import { IWebServer, IWebSocketServer } from "@fluidframework/server-services-core";

export class WebServer implements IWebServer {
    constructor(public httpServer: HttpServer, public webSocketServer: IWebSocketServer) {
    }

    public async close(): Promise<void> {
        await Promise.all([this.httpServer.close(), this.webSocketServer.close()]);
    }
}
