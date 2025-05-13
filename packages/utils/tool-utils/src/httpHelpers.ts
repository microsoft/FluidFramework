/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "node:http";
import type { Socket } from "node:net";

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-jsdoc
export interface ITrackedHttpServer {
	readonly server: http.Server;
	readonly sockets: Set<Socket>;
	fullyClose(): void;
}

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-jsdoc
export function createTrackedServer(
	port: number,
	requestListener: http.RequestListener,
): ITrackedHttpServer {
	// eslint-disable-next-line jsdoc/require-jsdoc
	const server = http.createServer(requestListener).listen(port);
	// eslint-disable-next-line jsdoc/require-jsdoc
	const sockets = new Set<Socket>();

	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});

	return {
		server,
		sockets,
		fullyClose(): void {
			server.close();
			// eslint-disable-next-line jsdoc/require-jsdoc
			for (const socket of sockets) {
				socket.destroy();
			}
		},
	};
}

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-jsdoc
export type OnceListenerHandler<T> = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
) => Promise<T>;

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-jsdoc
export type OnceListenerResult<T> = Promise<() => Promise<T>>;

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-jsdoc
export const serverListenAndHandle = async <T>(
	port: number,
	handler: OnceListenerHandler<T>,
): OnceListenerResult<T> =>
	// eslint-disable-next-line promise/param-names
	new Promise((outerResolve, outerReject) => {
		// eslint-disable-next-line promise/param-names, jsdoc/require-jsdoc
		const innerP = new Promise<T>((innerResolve, innerReject) => {
			// eslint-disable-next-line jsdoc/require-jsdoc
			const httpServer = createTrackedServer(port, (req, res) => {
				// ignore favicon
				if (req.url === "/favicon.ico") {
					res.writeHead(200, { "Content-Type": "image/x-icon" });
					res.end();
					return;
				}
				handler(req, res)
					.finally(() => httpServer.fullyClose())
					.then(
						(result) => innerResolve(result),
						(error) => innerReject(error),
					);
			});
			outerResolve(async () => innerP);
		});
	});

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-jsdoc
export const endResponse = async (response: http.ServerResponse): Promise<void> =>
	new Promise((resolve, reject) => {
		try {
			response.end(resolve);
		} catch (error) {
			reject(error);
		}
	});
