/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router, RequestHandler, Request, Response } from "express";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IReadinessCheck, IReadinessStatus } from "@fluidframework/server-services-core";

function runProbe(probeType: string, probeCheck: IReadinessCheck, probeProps): RequestHandler {
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	return async (request: Request, response: Response) => {
		const probeStatus: IReadinessStatus = await probeCheck.isReady().catch((error) => {
			return { ready: false, exception: error };
		});
		if (probeStatus.ready) {
			response.sendStatus(200);
		} else {
			Lumberjack.error(`${probeType} probe failed`, probeProps, probeStatus.exception);
			response.sendStatus(503);
		}
	};
}

/**
 * Creates the health check endpoints for the service.
 * @param serviceName - The name of the service.
 * @param startupCheck - The startup check.
 * @param readinessCheck - Optional readiness check.
 * @param createLivenessEndpoint - Whether to create the liveness endpoint. Services like Alfred already have a ping endpoint, so this can be set to false.
 */
export function createHealthCheckEndpoints(
	serviceName: string,
	startupCheck: IReadinessCheck,
	readinessCheck?: IReadinessCheck,
	createLivenessEndpoint = true,
): Router {
	const router: Router = Router();

	const probeProps = {
		serviceName,
	};

	router.get("/startup", runProbe("Startup", startupCheck, probeProps));

	if (createLivenessEndpoint) {
		router.get(
			"/ping",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			async (request, response) => {
				response.sendStatus(200);
			},
		);
	}

	if (readinessCheck) {
		router.get("/ready", runProbe("Readiness", readinessCheck, probeProps));
	}

	return router;
}
