/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClient } from "@fluidframework/protocol-definitions";
import type {
	IOrderer,
	IOrdererConnection,
	IWebSocket,
} from "@fluidframework/server-services-core";

export interface IOrdererConnectionFactory {
	connect(socket: IWebSocket, client: IClient): Promise<IOrdererConnection>;
}

/**
 * Proxies ordering to an external service which does the actual ordering
 */
export class ProxyOrderer implements IOrderer {
	constructor(private readonly factory: IOrdererConnectionFactory) {}

	public async connect(
		socket: IWebSocket,
		clientId: string,
		client: IClient,
	): Promise<IOrdererConnection> {
		const proxiedSocket = await this.factory.connect(socket, client);
		return proxiedSocket;
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public close() {
		return Promise.resolve();
	}
}
