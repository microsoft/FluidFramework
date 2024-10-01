/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import { StartupChecker } from "./startupChecker";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Readiness status of a service or functionality.
 * @internal
 */
export interface IReadinessStatus {
	/**
	 * Whether the service/functionality is ready for use.
	 */
	ready: boolean;

	/**
	 * Optional exception if an error occurs.
	 */
	exception?: any;
}

/**
 * Checks if a service or functionality is ready for use.
 * @internal
 */
export interface IReadinessCheck {
	/**
	 * Whether the service/functionality is ready for use.
	 */
	isReady(): Promise<IReadinessStatus>;
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
			if (StartupChecker.getInstance().isStartupComplete()) {
				response.sendStatus(200);
			} else {
				Lumberjack.error("Startup probe failed", probeProps);
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

	if (readinessCheck) {
		router.get(
			"/ready",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			async (request, response) => {
				const readinessStatus: IReadinessStatus = await readinessCheck
					.isReady()
					.catch((error) => {
						return { ready: false, exception: error };
					});
				if (readinessStatus.ready) {
					response.sendStatus(200);
				} else {
					Lumberjack.error(
						"Readiness probe failed",
						probeProps,
						readinessStatus.exception,
					);
					response.sendStatus(503);
				}
			},
		);
	}

	return router;
}
