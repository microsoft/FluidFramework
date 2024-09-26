/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestHandler, Router, Request, Response, NextFunction } from "express";
import {
	throttle,
	IThrottleMiddlewareOptions,
	getParam,
} from "@fluidframework/server-services-utils";
import * as core from "@fluidframework/server-services-core";
import { StartupChecker } from "./startupChecker";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Checks if a service or functionality is ready for use.
 * @internal
 */
export interface IReadinessCheck {
	/**
	 * Whether the service/functionality is ready for use.
	 */
	isReady(): Promise<boolean>;
}

export interface IThrottlerConfig {
	tenantThrottlers: Map<string, core.IThrottler>;
	restThrottleIdSuffix: string;
	generalRestCallThrottleIdPrefix: string;
}

function noopMiddleware(req: Request, res: Response, next: NextFunction) {
	next();
}

/**
 * Creates the health check endpoints for the service.
 * @param serviceName - The name of the service.
 * @param readinessCheck - Optional readiness check.
 * @param createLivenessEndpoint - Whether to create the liveness endpoint. Services like Alfred already have a ping endpoint, so this can be set to false.
 * @param throttlerConfig - Optional throttler configuration.
 */
export function createHealthCheckEndpoints(
	serviceName: string,
	readinessCheck?: IReadinessCheck,
	createLivenessEndpoint = true,
	throttlerConfig?: IThrottlerConfig,
): Router {
	const router: Router = Router();
	let tenantThrottleOptions: Partial<IThrottleMiddlewareOptions>;
	let generalTenantThrottler: core.IThrottler;
	let readinessThrottler: RequestHandler;

	if (throttlerConfig) {
		tenantThrottleOptions = {
			throttleIdPrefix: (req) => getParam(req.params, "tenantId") || "",
			throttleIdSuffix: throttlerConfig.restThrottleIdSuffix,
		};
		generalTenantThrottler = throttlerConfig.tenantThrottlers.get(
			throttlerConfig.generalRestCallThrottleIdPrefix,
		) as core.IThrottler;

		readinessThrottler = throttle(generalTenantThrottler, undefined, {
			...tenantThrottleOptions,
			throttleIdPrefix: "ready",
		});
	}

	const probeProps = {
		serviceName,
	};

	router.get(
		"/startup",
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			const startupProbeMetric = Lumberjack.newLumberMetric(
				LumberEventName.StartupProbe,
				probeProps,
			);
			if (StartupChecker.getInstance().isStartupComplete()) {
				startupProbeMetric.success("Startup probe successful");
				response.sendStatus(200);
			} else {
				startupProbeMetric.error("Startup probe failed");
				response.sendStatus(500);
			}
		},
	);

	if (createLivenessEndpoint) {
		router.get(
			"/ping",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			async (request, response) => {
				const livenessProbeMetric = Lumberjack.newLumberMetric(
					LumberEventName.LivenessProbe,
					probeProps,
				);
				livenessProbeMetric.success("Liveness probe successful");
				response.sendStatus(200);
			},
		);
	}

	router.get(
		"/ready",
		throttlerConfig ? readinessThrottler : noopMiddleware,
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			const readinessProbeMetric = Lumberjack.newLumberMetric(
				LumberEventName.ReadinessProbe,
				probeProps,
			);
			if ((await readinessCheck?.isReady()) === false) {
				readinessProbeMetric.error("Readiness probe failed");
				response.sendStatus(503);
			} else {
				readinessProbeMetric.success("Readiness probe successful");
				response.sendStatus(200);
			}
		},
	);

	return router;
}
