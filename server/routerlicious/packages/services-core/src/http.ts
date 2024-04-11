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
export interface IWebServerFactory<WSS = unknown> {
	create(requestListener?: RequestListener): IWebServer<WSS>;
}

/**
 * @alpha
 */
export interface IWebSocket<T = unknown> {
	id: string;

	internalSocketInstance?: T;

	on(event: string, listener: (...args: any[]) => void);

	join(id: string): Promise<void>;

	emit(event: string, ...args);

	emitToRoom(roomId: string, event: string, ...args: any[]);

	disconnect(close?: boolean): void;
}

/**
 * @internal
 */
export interface IWebServer<WSS = unknown> {
	/**
	 * Web socket interface
	 */
	webSocketServer: IWebSocketServer<WSS>;

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
export interface IWebSocketServer<T = unknown> {
	internalServerInstance?: T;

	on(event: string, listener: (...args: any[]) => void);

	close(): Promise<void>;
}

/**
 * @internal
 */
export interface IHttpServer {
	listen(port: any): void;

	on(event: string, listener: (...args: any[]) => void);

	address(): { port: number; family: string; address: string };
}
