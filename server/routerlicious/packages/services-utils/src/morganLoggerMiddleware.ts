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
import { getCorrelationIdWithHttpFallback } from "./asyncLocalStorage";
import { getTelemetryContextPropertiesWithHttpInfo } from "./telemetryContext";

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

/**
 * @internal
 */
interface IResponseLatency {
    /**
     * Emitted when the response has been sent.
     * More specifically, this event is emitted when the last segment of the response headers and body have been handed off to the operating system for transmission over the network.
     * It does not imply that the client has received anything yet.
     * Docs: https://nodejs.org/docs/latest-v16.x/api/http.html#event-finish_1
     */
    finishTime: number | undefined;
    /**
     * Indicates that the response is completed, or its underlying connection was terminated prematurely (before the response completion).
     * Docs: https://nodejs.org/docs/latest-v16.x/api/http.html#event-close_2
     */
    closeTime: number;
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
): express.RequestHandler {
	return (request, response, next): void => {
        const responseLatencyP = new Promise<IResponseLatency>((resolve) => {
            let finishTime: number | undefined;
            const finishListener = () => {
                finishTime = performance.now();
            };
            response.once("finish", finishListener);
            response.once("close", () => {
                response.removeListener("finish", finishListener);
                const closeTime = performance.now();
                resolve({ finishTime, closeTime });
            });
        });
        const startTime = performance.now();
		const httpMetric = Lumberjack.newLumberMetric(LumberEventName.HttpRequest);
		morgan<express.Request, express.Response>((tokens, req, res) => {
			let additionalProperties = {};
			if (computeAdditionalProperties) {
				additionalProperties = computeAdditionalProperties(tokens, req, res);
			}
			const properties = {
				[HttpProperties.method]: tokens.method(req, res) ?? "METHOD_UNAVAILABLE",
				[HttpProperties.pathCategory]: `${req.baseUrl}${
					req.route?.path ?? "PATH_UNAVAILABLE"
				}`,
				[HttpProperties.url]: tokens.url(req, res),
				[HttpProperties.status]: tokens.status(req, res) ?? "STATUS_UNAVAILABLE",
				[HttpProperties.requestContentLength]: tokens.req(req, res, "content-length"),
				[HttpProperties.responseContentLength]: tokens.res(req, res, "content-length"),
				[HttpProperties.responseTime]: tokens["response-time"](req, res),
				[BaseTelemetryProperties.correlationId]: getCorrelationIdWithHttpFallback(req, res),
				[CommonProperties.serviceName]: serviceName,
				[CommonProperties.telemetryGroupName]: "http_requests",
				...additionalProperties,
				...getTelemetryContextPropertiesWithHttpInfo(req, res),
			};
			httpMetric.setProperties(properties);
            const resolveMetric = () => {
                if (properties.status?.startsWith("2")) {
                    httpMetric.success("Request successful");
                } else {
                    httpMetric.error("Request failed");
                }
            }
            if (enableLatencyMetric) {
                // Morgan middleware logs using the [on-finished](https://www.npmjs.com/package/on-finished) package, meaning that it will log
                // request duration immediately on response 'finish' event. However, the gap between 'finish' and 'close' can be helpful for
                // understanding response latency.
                const endTime = performance.now();
                // HTTP Metric durationInMs should only track internal server time, so manually set it before waiting for response close.
                httpMetric.setProperty("durationInMs", endTime - startTime);
                // Wait for response 'close' event to signal that the response is completed.
                responseLatencyP.then((responseLatency) => {
                    const finishToCloseDurationMs: number = responseLatency.finishTime === undefined
                        ? -1 // Underlying connection was terminated prematurely (before the response completion)
                        : responseLatency.closeTime - responseLatency.finishTime;
                    httpMetric.setProperty(HttpProperties.responseLatencyMs, finishToCloseDurationMs);
                }).catch((error) => {
                    Lumberjack.error("Failed to track 'close' event for HTTP Request", properties, error);
                }).finally(() => {
                    resolveMetric();
                });
            } else {
                resolveMetric();
            }
			return undefined;
		})(request, response, next);
	};
}
