/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as http from "http";
import { AddressInfo } from "net";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import {
	BaseTelemetryProperties,
	CommonProperties,
	HttpProperties,
	LumberEventName,
	Lumberjack,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import * as socketIo from "./socketIoServer";

export type RequestListener = (
	request: http.IncomingMessage,
	response: http.ServerResponse,
) => void;

export class HttpServer implements core.IHttpServer {
	constructor(private readonly server: http.Server) {}

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
	constructor(public httpServer: HttpServer, public webSocketServer: core.IWebSocketServer) {}

	/**
	 * Closes the web server
	 */
	public async close(): Promise<void> {
		// Since httpServer is reused in webSocketServer, only need to shutdown webSocketServer.
		await (this.webSocketServer ? this.webSocketServer.close() : this.httpServer.close());
	}
}

export interface IHttpServerConfig {
	/**
	 * The number of milliseconds of inactivity before a socket is presumed to have timed out.
	 * A value of 0 will disable the timeout behavior on incoming connections.
	 * Default: 0 (disabled)
	 */
	connectionTimeoutMs: number;
	enableSocketIoRequestTelemetry: boolean;
}

const defaultHttpServerConfig: IHttpServerConfig = {
	connectionTimeoutMs: 0,
	enableSocketIoRequestTelemetry: false,
};
const createAndConfigureHttpServer = (
	requestListener: RequestListener,
	httpServerConfig: Partial<IHttpServerConfig> | undefined,
): http.Server => {
	const server = http.createServer(requestListener);
	server.timeout =
		httpServerConfig?.connectionTimeoutMs ?? defaultHttpServerConfig.connectionTimeoutMs;
	const enableSocketIoRequestTelemetry =
		httpServerConfig?.enableSocketIoRequestTelemetry ??
		defaultHttpServerConfig.enableSocketIoRequestTelemetry;
	if (enableSocketIoRequestTelemetry) {
		server.on("request", (request, response) => {
			if (!request.url) return;
			const url = new URL(request.url);
			const socketIoPath = "/socket.io/";
			if (url.pathname !== socketIoPath) return;

			const httpMetric = Lumberjack.newLumberMetric(LumberEventName.SocketIoRequest);
			const additionalProperties = {
				protocolVersion: url.searchParams.get("EIO"), // '2', '3', or '4'
				transport: url.searchParams.get("transport"), // 'websocket' or 'polling'
				[BaseTelemetryProperties.tenantId]: url.searchParams.get("tenantId") ?? "",
				[BaseTelemetryProperties.documentId]: url.searchParams.get("documentId") ?? "",
			};
			response.once("close", () => {
				const properties = {
					[HttpProperties.method]: request.method ?? "METHOD_UNAVAILABLE",
					[HttpProperties.pathCategory]: socketIoPath,
					[HttpProperties.url]: url,
					[HttpProperties.status]: `${response.statusCode}` || "STATUS_UNAVAILABLE",
					[HttpProperties.requestContentLength]: request.headers["content-length"],
					[HttpProperties.responseContentLength]: response.getHeader("content-length"),
					[HttpProperties.responseTime]: response.getHeader("response-time"),
					[CommonProperties.telemetryGroupName]: "http_requests",
					...additionalProperties,
				};
				httpMetric.setProperties(properties);
				if (properties.status?.startsWith("2")) {
					httpMetric.success("Socket.io request successful");
				} else {
					httpMetric.error("Socket.io request failed");
				}
			});
		});
	}
	return server;
};

export class SocketIoWebServerFactory implements core.IWebServerFactory {
	constructor(
		private readonly redisConfig: any,
		private readonly socketIoAdapterConfig?: any,
		private readonly httpServerConfig?: IHttpServerConfig,
		private readonly socketIoConfig?: any,
	) {}

	public create(requestListener: RequestListener): core.IWebServer {
		// Create the base HTTP server and register the provided request listener
		const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);
		const httpServer = new HttpServer(server);

		const socketIoServer = socketIo.create(
			this.redisConfig,
			server,
			this.socketIoAdapterConfig,
			this.socketIoConfig,
		);

		return new WebServer(httpServer, socketIoServer);
	}
}

export class BasicWebServerFactory implements core.IWebServerFactory {
	constructor(private readonly httpServerConfig?: IHttpServerConfig) {}

	public create(requestListener: RequestListener): core.IWebServer {
		// Create the base HTTP server and register the provided request listener
		const server = createAndConfigureHttpServer(requestListener, this.httpServerConfig);
		const httpServer = new HttpServer(server);

		return new WebServer(httpServer, null as unknown as core.IWebSocketServer);
	}
}
