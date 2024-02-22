/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";

/**
 * @internal
 */
export type RequestListener = (
	request: http.IncomingMessage,
	response: http.ServerResponse,
) => void;

/**
 * @internal
 */
export interface IWebServerFactory {
	create(requestListener?: RequestListener): IWebServer;
}

/**
 * @alpha
 */
export interface IWebSocket {
	id: string;

	on(event: string, listener: (...args: any[]) => void);

	join(id: string): Promise<void>;

	emit(event: string, ...args);

	emitToRoom(roomId: string, event: string, ...args: any[]);

	disconnect(close?: boolean): void;
}

/**
 * @internal
 */
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

/**
 * @alpha
 */
export interface IWebSocketServer {
	on(event: string, listener: (...args: any[]) => void);

	close(): Promise<void>;

	/**
	 * Get the list of socket ID's connected to a room
	 * @remarks This can be useful for checking how many clients are connected to a given document.
	 */
	getRoomMembers?(roomId: string): Set<string> | undefined;
}

/**
 * @internal
 */
export interface IHttpServer {
	listen(port: any): void;

	on(event: string, listener: (...args: any[]) => void);

	address(): { port: number; family: string; address: string };
}
