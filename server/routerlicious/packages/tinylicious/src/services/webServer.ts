/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IWebServer, IWebSocketServer } from "@fluidframework/server-services-core";
import { HttpServer } from "@fluidframework/server-services-shared";

export class WebServer implements IWebServer {
	constructor(
		public httpServer: HttpServer,
		public webSocketServer: IWebSocketServer,
	) {}

	public async close(): Promise<void> {
		await Promise.all([this.httpServer.close(), this.webSocketServer.close()]);
	}
}
