/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
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

/**
 * Creates the health check endpoints for the service.
 * @param serviceName - The name of the service.
 * @param readinessCheck - Optional readiness check.
 * @param createLivenessEndpoint - Whether to create the liveness endpoint. Services like Alfred already have a ping endpoint, so this can be set to false.
 */
export function createHealthCheckEndpoints(
	serviceName: string,
	readinessCheck?: IReadinessCheck,
	createLivenessEndpoint = true,
): Router {
	const router: Router = Router();

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
				response.sendStatus(200);
			},
		);
	}

	router.get(
		"/ready",
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
				response.sendStatus(200);
			}
		},
	);

	return router;
}
