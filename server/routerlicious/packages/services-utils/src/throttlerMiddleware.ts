/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestHandler, Request, Response, NextFunction } from "express";
import safeStringify from "json-stringify-safe";
import { IThrottler, ILogger, ThrottlingError } from "@fluidframework/server-services-core";

export interface IThrottleMiddlewareOptions {
    /**
     * Relative weight of request amongst other requests with same suffix.
     */
    weight: number;

    /**
     * Distinguishes throttle id amongst other tracked ids with same suffix.
     * For example, this could be a tenantId, clientId, or endpoint name.
     *
     * Can be a function that takes in the `express.Request` and returns the prefix as a string,
     * which is useful for getting the id prefix from route params, such as `tenantId`.
     */
    throttleIdPrefix?: string | ((req: Request) => string);

    /**
     * Distinguishes throttle id amongst other tracked ids with same prefix.
     * For example, this could be "HistorianRest", "AlfredRest", "OpenSocketConn", or "SubmitOp".
     */
    throttleIdSuffix?: string;
}

const defaultThrottleMiddlewareOptions: IThrottleMiddlewareOptions = {
    weight: 1,
    throttleIdPrefix: undefined,
    throttleIdSuffix: undefined,
};

const getThrottleId = (req: Request, throttleOptions: IThrottleMiddlewareOptions) => {
    let prefix: string | undefined;
    if (typeof throttleOptions.throttleIdPrefix === "function") {
        prefix = throttleOptions.throttleIdPrefix(req);
    } else {
        prefix = throttleOptions.throttleIdPrefix;
    }

    if (prefix && throttleOptions.throttleIdSuffix) {
        return `${prefix}_${throttleOptions.throttleIdSuffix}`;
    }
    return prefix || throttleOptions.throttleIdSuffix || "-";
};

function noopMiddleware(req: Request, res: Response, next: NextFunction) {
    next();
}

/**
 * Express middleware for API throttling.
 */
export function throttle(
    throttler: IThrottler,
    logger?: ILogger,
    options?: Partial<IThrottleMiddlewareOptions>): RequestHandler {
        const throttleOptions = {
            ...defaultThrottleMiddlewareOptions,
            ...options,
        };

        if (throttleOptions.weight === 0) {
            logger?.info("Throttle middleware created with 0 weight: Replacing with no-op middleware.");
            return noopMiddleware;
        }

        return (req, res, next) => {
            const throttleId = getThrottleId(req, throttleOptions);

            try {
                throttler.incrementCount(throttleId, throttleOptions.weight);
            } catch (e) {
                if (e instanceof ThrottlingError) {
                    return res.status(e.code).json(e);
                } else {
                    logger?.error(
                        `Throttle increment failed: ${safeStringify(e, undefined, 2)}`,
                        {
                            messageMetaData: {
                                key: throttleId,
                                eventName: "throttling",
                            },
                        });
                }
            }

            next();
        };
    }
