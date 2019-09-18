/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@microsoft/fluid-server-services-core";
import * as ws from "ws";

export class NodeWebSocketServer implements core.IWebSocketServer {
    private webSocketServer: ws.Server;

    constructor(portNumber: number) {
        this.webSocketServer = new ws.Server({ port: portNumber });
    }
    public on(event: string, listener: (...args: any[]) => void) {
        this.webSocketServer.on(event, listener);
    }
    public close(): Promise<void> {
        this.webSocketServer.close();
        return Promise.resolve();
    }
}
