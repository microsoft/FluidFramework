/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import express from "express";
import http from "http";
import morgan from "morgan";

import {
    BaseTelemetryProperties,
    CommonProperties,
    HttpProperties,
    LumberEventName,
    Lumberjack,
} from "@fluidframework/server-services-telemetry";

import { getCorrelationIdWithHttpFallback } from "./asyncLocalStorage";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const split = require("split");

/**
 * Replace Express Request & Response to http
 * https://github.com/DefinitelyTyped/DefinitelyTyped/commit/7f6441aaf2180a8a716f091bd6a75aeb359f69c3
 */

type HttpRequest = http.IncomingMessage;
type HttpResponse = http.ServerResponse;

 // eslint-disable-next-line max-len
 type Handler<Request extends HttpRequest, Response extends HttpResponse> = (req: Request, res: Response, callback: (err?: Error) => void) => void;

/**
 * Basic stream logging interface for libraries that require a stream to pipe output to (re: Morgan)
 */
const stream = split().on("data", (message) => {
    if (message !== undefined) {
        Lumberjack.info(message);
    }
});

export function alternativeMorganLoggerMiddleware(loggerFormat: string) {
    return morgan(loggerFormat, { stream });
}

export function jsonMorganLoggerMiddleware(
    serviceName: string,
    computeAdditionalProperties?: (
        tokens: morgan.TokenIndexer,
        req: HttpRequest,
        res: HttpResponse) => Record<string, any>,
    ): Handler<HttpRequest, HttpResponse> {
    return (request, response, next): void => {
        const httpMetric = Lumberjack.newLumberMetric(LumberEventName.HttpRequest);
        morgan((tokens, req, res) => {
            let additionalProperties = {};
            if (computeAdditionalProperties) {
                additionalProperties = computeAdditionalProperties(tokens, req, res);
            }
            const properties = {
                [HttpProperties.method]: tokens.method(req, res) || "METHOD_UNAVAILABLE",
                [HttpProperties.pathCategory]: `${req.baseUrl}${req.route?.path ?? "PATH_UNAVAILABLE"}`,
                [HttpProperties.url]: tokens.url(req, res),
                [HttpProperties.status]: tokens.status(req, res) || "STATUS_UNAVAILABLE",
                [HttpProperties.requestContentLength]: tokens.req(req, res, "content-length"),
                [HttpProperties.responseContentLength]: tokens.res(req, res, "content-length"),
                [HttpProperties.responseTime]: tokens["response-time"](req, res),
                [BaseTelemetryProperties.correlationId]: getCorrelationIdWithHttpFallback(req, res),
                [CommonProperties.serviceName]: serviceName,
                [CommonProperties.telemetryGroupName]: "http_requests",
                ...additionalProperties,
            };
            httpMetric.setProperties(properties);
            if (properties.status?.startsWith("2")) {
                httpMetric.success("Request successful");
            } else {
                httpMetric.error("Request failed");
            }
            return undefined;
        })(request, response, next);
    };
}
