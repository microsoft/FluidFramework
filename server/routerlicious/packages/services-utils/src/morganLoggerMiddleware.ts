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

export function alternativeMorganLoggerMiddleware(loggerFormat: string) {
    return morgan(loggerFormat, { stream });
}

export function jsonMorganLoggerMiddleware(
    serviceName: string,
    computeAdditionalProperties?: (
        tokens: morgan.TokenIndexer,
        req: express.Request,
        res: express.Response) => Record<string, any>,
    ): express.RequestHandler {
    return (request, response, next): void => {
        const httpMetric = Lumberjack.newLumberMetric(LumberEventName.HttpRequest);
        morgan((tokens, req, res) => {
            let additionalProperties = {};
            if (computeAdditionalProperties) {
                additionalProperties = computeAdditionalProperties(tokens, req, res);
            }
            const properties = {
                [HttpProperties.method]: tokens.method(req, res),
                [HttpProperties.pathCategory]: `${req.baseUrl}${req.route?.path ?? "PATH_UNAVAILABLE"}`,
                [HttpProperties.url]: tokens.url(req, res),
                [HttpProperties.status]: tokens.status(req, res),
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
