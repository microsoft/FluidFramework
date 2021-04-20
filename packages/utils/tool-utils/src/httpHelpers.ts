/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import http from "http";
import { Socket } from "net";

export interface ITrackedHttpServer {
    readonly server: http.Server;
    readonly sockets: Set<Socket>;
    fullyClose(): void;
}
export function createTrackedServer(port: number, requestListener: http.RequestListener): ITrackedHttpServer {
    const server = http.createServer(requestListener).listen(port);
    const sockets = new Set<Socket>();

    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });

    return {
        server, sockets, fullyClose() {
            server.close();
            sockets.forEach((socket) => socket.destroy());
        },
    };
}
export type OnceListenerHandler<T> = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<T>;
export type OnceListenerResult<T> = Promise<() => Promise<T>>;
export const serverListenAndHandle = async <T>(port: number, handler: OnceListenerHandler<T>): OnceListenerResult<T> =>
    new Promise((outerResolve, outerReject) => {
        const innerP = new Promise<T>((innerResolve, innerReject) => {
            const httpServer = createTrackedServer(port, (req, res) => {
                // ignore favicon
                if (req.url === "/favicon.ico") {
                    res.writeHead(200, { "Content-Type": "image/x-icon" });
                    res.end();
                    return;
                }
                handler(req, res).finally(() => httpServer.fullyClose()).then(
                    (result) => innerResolve(result),
                    (error) => innerReject(error),
                );
            });
            outerResolve(async () => innerP);
        });
    });

export const endResponse = async (response: http.ServerResponse): Promise<void> => new Promise((resolve, reject) => {
    try {
        response.end(resolve);
    } catch (error) {
        reject(error);
    }
});
