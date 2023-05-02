/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestHandler, Request, Response, NextFunction } from "express";
import safeStringify from "json-stringify-safe";
import { IThrottler, ILogger, ThrottlingError } from "@fluidframework/server-services-core";
import {
	CommonProperties,
	Lumberjack,
	ThrottlingTelemetryProperties,
} from "@fluidframework/server-services-telemetry";
import { getParam } from "./auth";

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
	const prefix =
		typeof throttleOptions.throttleIdPrefix === "function"
			? throttleOptions.throttleIdPrefix(req)
			: throttleOptions.throttleIdPrefix;

	if (prefix && throttleOptions.throttleIdSuffix) {
		return `${prefix}_${throttleOptions.throttleIdSuffix}`;
	}
	return prefix ?? throttleOptions.throttleIdSuffix ?? "-";
};

function noopMiddleware(req: Request, res: Response, next: NextFunction) {
	next();
}

/**
 * Express middleware for API tenant throttling.
 */
export function tenantThrottle(
	throttleApi: string,
	tenantThrottlersMap: Map<string, string>,
	throttlersMap: Map<string, Map<string, IThrottler>>,
	appTenantId?: string,
): RequestHandler {
	return (req, rest, next) => {
		const tenantId = getParam(req.params, "tenantId") ?? appTenantId;
		const tenantGroup: string | undefined = tenantId
			? tenantThrottlersMap?.get(tenantId)
			: undefined;
		const throttleOptions: Partial<IThrottleMiddlewareOptions> = {
			throttleIdPrefix: tenantGroup ? `${tenantId}_${tenantGroup}` : tenantId,
			throttleIdSuffix: throttleApi,
		};
		const throttler = tenantGroup
			? throttlersMap.get(tenantGroup)?.get(throttleApi)
			: throttlersMap.get("generalTenant")?.get(throttleApi);
		if (throttler) {
			return throttle(throttler, undefined, throttleOptions)(req, rest, next);
		}
		next();
	};
}

/**
 * Express middleware for API throttling.
 */
export function throttle(
	throttler: IThrottler,
	logger?: ILogger,
	options?: Partial<IThrottleMiddlewareOptions>,
): RequestHandler {
	const throttleOptions = {
		...defaultThrottleMiddlewareOptions,
		...options,
	};

	if (throttleOptions.weight === 0) {
		const messageMetaData = {
			weight: 0,
			eventName: "throttling",
		};
		logger?.info(
			"Throttle middleware created with 0 weight: Replacing with no-op middleware.",
			{ messageMetaData },
		);
		Lumberjack.info(
			"Throttle middleware created with 0 weight: Replacing with no-op middleware.",
			{
				[CommonProperties.telemetryGroupName]: "throttling",
				[ThrottlingTelemetryProperties.weight]: 0,
			},
		);
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
				logger?.error(`Throttle increment failed: ${safeStringify(e, undefined, 2)}`, {
					messageMetaData: {
						key: throttleId,
						eventName: "throttling",
					},
				});
				Lumberjack.error(
					`Throttle increment failed`,
					{
						[CommonProperties.telemetryGroupName]: "throttling",
						[ThrottlingTelemetryProperties.key]: throttleId,
					},
					e,
				);
			}
		}

		next();
	};
}
