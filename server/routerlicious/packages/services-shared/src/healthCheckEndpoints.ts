import { RequestHandler, Router, Request, Response, NextFunction } from "express";
import {
	throttle,
	IThrottleMiddlewareOptions,
	getParam,
} from "@fluidframework/server-services-utils";
import * as core from "@fluidframework/server-services-core";
import { StartupChecker } from "./startupChecker";

export interface IReadinessCheck {
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

export function createHealthCheckEndpoints(
	readinessCheck?: IReadinessCheck,
	createLivenessEndpoint = true,
	throttlerConfig?: IThrottlerConfig,
): Router {
	const router: Router = Router();
	let tenantThrottleOptions: Partial<IThrottleMiddlewareOptions>;
	let generalTenantThrottler: core.IThrottler;
	let startupThrottler: RequestHandler;
	let pingThrottler: RequestHandler;
	let readinessThrottler: RequestHandler;

	if (throttlerConfig) {
		tenantThrottleOptions = {
			throttleIdPrefix: (req) => getParam(req.params, "tenantId") || "",
			throttleIdSuffix: throttlerConfig.restThrottleIdSuffix,
		};
		generalTenantThrottler = throttlerConfig.tenantThrottlers.get(
			throttlerConfig.generalRestCallThrottleIdPrefix,
		) as core.IThrottler;
		startupThrottler = throttle(generalTenantThrottler, undefined, {
			...tenantThrottleOptions,
			throttleIdPrefix: "startup",
		});

		pingThrottler = throttle(generalTenantThrottler, undefined, {
			...tenantThrottleOptions,
			throttleIdPrefix: "ping",
		});

		readinessThrottler = throttle(generalTenantThrottler, undefined, {
			...tenantThrottleOptions,
			throttleIdPrefix: "ready",
		});
	}

	router.get(
		"/startup",
		throttlerConfig ? startupThrottler : noopMiddleware,
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			if (StartupChecker.getInstance().isStartupComplete()) {
				response.sendStatus(200);
			} else {
				response.sendStatus(500);
			}
		},
	);

	if (createLivenessEndpoint) {
		router.get(
			"/ping",
			throttlerConfig ? pingThrottler : noopMiddleware,
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			async (request, response) => {
				response.sendStatus(200);
			},
		);
	}

	router.get(
		"/ready",
		throttlerConfig ? readinessThrottler : noopMiddleware,
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		async (request, response) => {
			if (readinessCheck) {
				if (await readinessCheck.isReady()) {
					response.sendStatus(200);
				} else {
					response.sendStatus(503);
				}
			} else {
				response.sendStatus(200);
			}
		},
	);

	return router;
}
