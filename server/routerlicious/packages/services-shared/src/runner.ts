/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nconf from "nconf";
import { serializeError } from "serialize-error";
import {
	ILogger,
	IResources,
	IResourcesFactory,
	IRunnerFactory,
} from "@fluidframework/server-services-core";
import { Lumberjack, LumberEventName } from "@fluidframework/server-services-telemetry";

/**
 * Uses the provided factories to create and execute a runner.
 */
export async function run<T extends IResources>(
	config: nconf.Provider,
	resourceFactory: IResourcesFactory<T>,
	runnerFactory: IRunnerFactory<T>,
	logger: ILogger | undefined,
) {
	const customizations = await (resourceFactory.customize
		? resourceFactory.customize(config)
		: undefined);
	const resources = await resourceFactory.create(config, customizations);
	const runner = await runnerFactory.create(resources);

	// Start the runner and then listen for the message to stop it
	const runningP = runner.start(logger).catch(async (error) => {
		logger?.error(`Encountered exception while running service: ${serializeError(error)}`);
		Lumberjack.error(`Encountered exception while running service`, undefined, error);
		await runner.stop().catch((innerError) => {
			logger?.error(`Could not stop runner due to error: ${innerError}`);
			Lumberjack.error(`Could not stop runner due to error`, undefined, innerError);
			error.forceKill = true;
		});
		return Promise.reject(error);
	});

	process.on("SIGTERM", () => {
		Lumberjack.info(`Received SIGTERM request to stop the service.`);
		runner.stop().catch((error) => {
			logger?.error(`Could not stop runner after SIGTERM due to error: ${error}`);
			Lumberjack.error(`Could not stop runner after SIGTERM due to error`, undefined, error);
		});
	});

	process.on("uncaughtException", (error, origin) => {
		Lumberjack.error(`Encountered uncaughtException while running service`, { origin }, error);
		runner.stop().catch((innerError) => {
			logger?.error(
				`Could not stop runner after uncaughtException event due to error: ${innerError}`,
			);
			Lumberjack.error(
				`Could not stop runner after uncaughtException event due to error`,
				undefined,
				innerError,
			);
		});
	});

	try {
		// Wait for the runner to complete
		await runningP;
	} finally {
		// And then dispose of any resources
		await resources.dispose();
	}
}

/**
 * Variant of run that is used to fully run a service. It configures base settings such as logging. And then will
 * exit the service once the runner completes.
 */
export function runService<T extends IResources>(
	resourceFactory: IResourcesFactory<T>,
	runnerFactory: IRunnerFactory<T>,
	logger: ILogger | undefined,
	group: string,
	configOrPath: nconf.Provider | string,
	waitBeforeExitInMs?: number,
) {
	const config =
		typeof configOrPath === "string"
			? nconf
					.argv()
					.env({ separator: "__", parseValues: true })
					.file(configOrPath)
					.use("memory")
			: configOrPath;

	const waitInMs = waitBeforeExitInMs ?? 1000;
	const runnerMetric = Lumberjack.newLumberMetric(LumberEventName.RunService);
	const runningP = run(config, resourceFactory, runnerFactory, logger);

	runningP.then(
		async () => {
			await executeAndWait(() => {
				logger?.info("Exiting");
				runnerMetric.success(`${group} exiting.`);
			}, waitInMs);
			process.exit(0);
		},
		async (error) => {
			await executeAndWait(() => {
				logger?.error(`${group} service exiting due to error`);
				logger?.error(serializeError(error));
				runnerMetric.error(`${group} service exiting due to error`, error);
			}, waitInMs);
			if (error.forceKill) {
				process.kill(process.pid, "SIGKILL");
			} else {
				process.exit(1);
			}
		},
	);
}

/*
 * Waits after the execution of a given function. This helps ensure
 * log/telemetry data has time to be emitted before we exit the process
 * in runService().
 */
async function executeAndWait(func: () => void, waitInMs: number) {
	func();
	return new Promise((resolve) => {
		setTimeout(resolve, waitInMs);
	});
}
