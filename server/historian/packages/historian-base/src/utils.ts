/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { getParam } from "@fluidframework/server-services-utils";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { NetworkError } from "@fluidframework/server-services-client";
import { LogLevel, Lumberjack } from "@fluidframework/server-services-telemetry";
import * as jwt from "jsonwebtoken";
import winston from "winston";
import safeStringify from "json-stringify-safe";

export function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // named pipe
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return val;
    }

    if (normalizedPort >= 0) {
        // port number
        return normalizedPort;
    }

    return false;
}

export function getTokenLifetimeInSec(token: string): number {
    const claims = jwt.decode(token) as ITokenClaims;
    if (claims && claims.exp) {
        return (claims.exp - Math.round((new Date().getTime()) / 1000));
    }
    return undefined;
}

export function getTenantIdFromRequest(params: Params) {
    const tenantId = getParam(params, "tenantId");
    if (tenantId !== undefined) {
        return tenantId;
    }
    const id = getParam(params, "id");
    if (id !== undefined) {
        return id;
    }

    return "-";
}

/**
 * Pass into `.catch()` block of a RestWrapper call to output a more standardized network error.
 * @param url request url to be output in error log
 * @param method request method (e.g. "GET", "POST") to be output in error log
 * @param networkErrorOverride NetworkError to throw, regardless of error received from request
 */
export function getRequestErrorTranslator(
    url: string,
    method: string): (error: any) => never {
    const getStandardLogErrorMessage = (message: string) =>
        `[${method}] Request to [${url}] failed: ${message}`;
    const requestErrorTranslator = (error: any): never => {
        // BasicRestWrapper only throws `AxiosError.response.status` when available.
        // Only bubble the error code, but log additional details for debugging purposes
        if (typeof error === "number" || !Number.isNaN(Number.parseInt(error, 10)))  {
            const errorCode = typeof error === "number" ? error : Number.parseInt(error, 10);
            winston.error(getStandardLogErrorMessage(`${errorCode}`));
            Lumberjack.log(getStandardLogErrorMessage(`${errorCode}`), LogLevel.Error);
            throw new NetworkError(
                errorCode,
                "Internal Service Request Failed",
            );
        }
        // Treat anything else as an internal error, but log for debugging purposes
        winston.error(getStandardLogErrorMessage(safeStringify(error)));
        safelyLogError(getStandardLogErrorMessage(""), error);
        Lumberjack.log(getStandardLogErrorMessage(safeStringify(error)), LogLevel.Error);
        throw new NetworkError(500, "Internal Server Error");
    };
    return requestErrorTranslator;
}

/**
 * Safely log an error object, regardless of whether it is an instance of Error.
 * @param message - Human-friendly error message
 * @param error - Error object
 * @param properties - Lumber properties
 */
export function safelyLogError(message: string, error: any, properties?: Record<string, any> | Map<string, any>): void {
    if (!error) {
        Lumberjack.log(message, LogLevel.Error, properties);
    } else if (error instanceof Error) {
        Lumberjack.log(message, LogLevel.Error, properties, error);
    } else {
        Lumberjack.log([
            message,
            `Error: ${safeStringify(error)}`,
        ].join(message.charAt(message.length - 1) === "." ? " " : ". "), LogLevel.Error, properties, error);
    }
}
