/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import express from "express";
import morgan from "morgan";
import {
	BaseTelemetryProperties,
	CommonProperties,
	HttpProperties,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { getTelemetryContextPropertiesWithHttpInfo } from "./telemetryContext";
import { monitorEventLoopDelay, type IntervalHistogram } from "perf_hooks";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
	if (message !== undefined) {
		Lumberjack.info(message);
	}
});

/**
 * @internal
 */
export function alternativeMorganLoggerMiddleware(loggerFormat: string) {
	return morgan(loggerFormat, { stream });
}

morgan.token("http-version", (req: express.Request, res: express.Response) => req.httpVersion);
morgan.token("scheme", (req: express.Request, res: express.Response) => req.protocol);

/**
 * @internal
 */
interface IResponseLatency {
	/**
	 * Emitted after outgoingMessage.end() is called. When the event is emitted, all data has been processed but not necessarily completely flushed.
	 * Docs: https://nodejs.org/docs/latest-v18.x/api/http.html#event-prefinish
	 */
	prefinishTime: number | undefined;
	/**
	 * Emitted when the response has been sent.
	 * More specifically, this event is emitted when the last segment of the response headers and body have been handed off to the operating system for transmission over the network.
	 * It does not imply that the client has received anything yet.
	 * Docs: https://nodejs.org/docs/latest-v18.x/api/http.html#event-finish_1
	 */
	finishTime: number | undefined;
	/**
	 * Indicates that the response is completed, or its underlying connection was terminated prematurely (before the response completion).
	 * Docs: https://nodejs.org/docs/latest-v18.x/api/http.html#event-close_2
	 */
	closeTime: number;
}

function getEventLoopMetrics(histogram: IntervalHistogram) {
	return {
		max: (histogram.max / 1e6).toFixed(3),
		min: (histogram.min / 1e6).toFixed(3),
		mean: (histogram.mean / 1e6).toFixed(3),
	};
}

/**
 * @internal
 */
export function jsonMorganLoggerMiddleware(
	serviceName: string,
	computeAdditionalProperties?: (
		tokens: morgan.TokenIndexer<express.Request, express.Response>,
		req: express.Request,
		res: express.Response,
	) => Record<string, any>,
	enableLatencyMetric: boolean = false,
	enableEventLoopLagMetric: boolean = false, // This metric has performance overhead, so it should be enabled with caution.
): express.RequestHandler {
	return (request, response, next): void => {
		response.locals.clientDisconnected = false;
		response.locals.serverTimeout = false;
		// We observed 499 errors are sometime due to client side closed quickly before server can respond. Sometimes are due to
		// server side timeout which got terminated by the idle timeout we set in createAndConfigureHttpServer call.
		// We need to differentiate them
		// 1. If client side closed quickly before server idle timeout, socket would only emit close event, and we mark clientDisconnected if server have not write headers.
		// 2. If server side timeout, socket would emit timeout event, and we mark serverTimeout. Beside we manually close the socket suggested by node below, which further emit close event.
		// Therefore, we can use the difference of close and timeout event to differentiate client side close and server side timeout using statusCode logics.
		request.socket.on("close", () => {
			if (!response.headersSent) {
				response.locals.clientDisconnected = true;
			}
		});
		request.socket.on("timeout", () => {
			response.locals.serverTimeout = true;
			// According to node doc: https://nodejs.org/api/net.html#socketsettimeouttimeout-callback
			// When an idle timeout is triggered the socket will receive a 'timeout' event but the connection will not be severed.
			// The user must manually call socket.end() or socket.destroy() to end the connection.
			request.socket.destroy();
		});
		const responseLatencyP = enableLatencyMetric
			? new Promise<IResponseLatency>((resolve, reject) => {
					let complete = false;
					let prefinishTime: number | undefined;
					let finishTime: number | undefined;
					const prefinishListener = () => {
						prefinishTime = performance.now();
					};
					const finishListener = () => {
						finishTime = performance.now();
					};
					response.once("prefinish", prefinishListener);
					response.once("finish", finishListener);
					response.once("close", () => {
						response.removeListener("prefinish", prefinishListener);
						response.removeListener("finish", finishListener);
						const closeTime = performance.now();
						if (!complete) {
							complete = true;
							resolve({ prefinishTime, finishTime, closeTime });
						}
					});
					response.once("error", (error) => {
						if (!complete) {
							complete = true;
							reject(error);
						}
					});
			  })
			: undefined;
		// HTTP Metric durationInMs should only track internal server time, so manually set it before waiting for response close.
		const startTime = performance.now();
		let histogram: IntervalHistogram;
		if (enableEventLoopLagMetric) {
			histogram = monitorEventLoopDelay();
			histogram.enable();
		}
		const httpMetric = Lumberjack.newLumberMetric(LumberEventName.HttpRequest);
		morgan<express.Request, express.Response>((tokens, req, res) => {
			let additionalProperties = {};
			if (computeAdditionalProperties) {
				additionalProperties = computeAdditionalProperties(tokens, req, res);
			}
			const durationInMs = performance.now() - startTime;
			let statusCode = tokens.status(req, res);
			if (!statusCode) {
				// The effort of trying to distinguish client close vs server close can be tricky when it reaches proxy timeout.
				// If proxy timeout happen a little before server timeout, it is actually more due to a server timeout issue.
				// Therefore, we can assume it is server timeout (triggered by client) if duration is longer than 20s without
				// a valid status code
				if (res.locals.serverTimeout) {
					statusCode = "Server Timeout";
				} else if (res.locals.clientDisconnected) {
					statusCode =
						durationInMs > 20_000 ? "Server Timeout - Client Disconnect" : "499";
				} else {
					statusCode = "STATUS_UNAVAILABLE";
				}
			}
			const properties = {
				[HttpProperties.method]: tokens.method(req, res) ?? "METHOD_UNAVAILABLE",
				[HttpProperties.pathCategory]: `${req.baseUrl}${
					req.route?.path ?? "PATH_UNAVAILABLE"
				}`,
				[HttpProperties.url]: tokens.url(req, res),
				[HttpProperties.status]: statusCode,
				[HttpProperties.requestContentLength]: tokens.req(req, res, "content-length"),
				[HttpProperties.responseContentLength]: tokens.res(req, res, "content-length"),
				[HttpProperties.responseTime]: tokens["response-time"](req, res),
				[HttpProperties.httpVersion]: tokens["http-version"](req, res),
				[HttpProperties.scheme]: tokens.scheme(req, res),
				[BaseTelemetryProperties.correlationId]: getTelemetryContextPropertiesWithHttpInfo(
					req,
					res,
				).correlationId,
				[CommonProperties.serviceName]: serviceName,
				[CommonProperties.telemetryGroupName]: "http_requests",
				[HttpProperties.retryCount]: Number.parseInt(
					typeof req.query.retry === "string" ? req.query.retry : "0",
					10,
				),
				...additionalProperties,
				...getTelemetryContextPropertiesWithHttpInfo(req, res),
			};
			httpMetric.setProperties(properties);
			const resolveMetric = () => {
				if (enableEventLoopLagMetric) {
					histogram.disable();
					httpMetric.setProperty("eventLoopLagMs", getEventLoopMetrics(histogram));
				}
				if (properties.status?.startsWith("2")) {
					httpMetric.success("Request successful");
				} else {
					httpMetric.error("Request failed");
				}
			};
			if (enableLatencyMetric) {
				// Morgan middleware logs using the [on-finished](https://www.npmjs.com/package/on-finished) package, meaning that it will log
				// request duration immediately on response 'finish' event. However, the gap between 'finish' and 'close' can be helpful for
				// understanding response latency.
				httpMetric.setProperty("durationInMs", durationInMs);
				// Wait for response 'close' event to signal that the response is completed.
				responseLatencyP
					?.then((responseLatency) => {
						const prefinishToFinishDurationMs: number =
							responseLatency.prefinishTime === undefined ||
							responseLatency.finishTime === undefined
								? -1
								: responseLatency.finishTime - responseLatency.prefinishTime;
						const finishToCloseDurationMs: number =
							responseLatency.finishTime === undefined ||
							responseLatency.closeTime === undefined
								? -1 // Underlying connection was terminated prematurely (before the response completion)
								: responseLatency.closeTime - responseLatency.finishTime;
						httpMetric.setProperty(
							HttpProperties.responsePrefinishToFinishLatencyMs,
							prefinishToFinishDurationMs,
						);
						httpMetric.setProperty(
							HttpProperties.responseFinishToCloseLatencyMs,
							finishToCloseDurationMs,
						);
					})
					.catch((error) => {
						Lumberjack.error(
							"Failed to track 'close' event for HTTP Request",
							properties,
							error,
						);
					})
					.finally(() => {
						resolveMetric();
					});
			} else {
				resolveMetric();
			}
			return undefined;
		})(request, response, next);
	};
}
