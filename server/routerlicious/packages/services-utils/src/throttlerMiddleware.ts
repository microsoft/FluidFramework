/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestHandler, Request } from "express";
import onFinished from "on-finished";
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

    /**
     * If true, will decrement tracked throttler count for the given id when the response has been sent.
     */
    decrementOnFinish: boolean;
}

const defaultThrottleMiddlewareOptions: IThrottleMiddlewareOptions = {
    weight: 1,
    throttleIdPrefix: undefined,
    throttleIdSuffix: undefined,
    decrementOnFinish: false,
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

        return (req, res, next) => {
            const throttleId = getThrottleId(req, throttleOptions);
            const messageMetaData = {
                key: throttleId,
                weight: throttleOptions.weight,
                event_type: "throttling",
            };

            logger?.info(`Incrementing throttle count: ${throttleId}`, { messageMetaData });
            try {
                throttler.incrementCount(throttleId, throttleOptions.weight);
            } catch (e) {
                if (e instanceof ThrottlingError) {
                    logger?.info(`Throttled: ${throttleId}`, { messageMetaData: {
                        ...messageMetaData,
                        reason: e.message,
                        retryAfterInSeconds: e.retryAfter,
                    } });
                    return res.status(e.code).json(e);
                }
            }

            if (throttleOptions.decrementOnFinish) {
                onFinished(res, () => {
                    logger?.info(`Decrementing throttle count: ${throttleId}`, { messageMetaData });
                    throttler.decrementCount(throttleId, throttleOptions.weight);
                });
            }

            next();
        };
    }
