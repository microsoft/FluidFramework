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
import {
	Lumberjack,
	LumberEventName,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import { ConfigDumper } from "./configDumper";

/**
 * Uses the provided factories to create and execute a runner.
 * @internal
 */
export async function run<T extends IResources>(
	config: nconf.Provider,
	resourceFactory: IResourcesFactory<T>,
	runnerFactory: IRunnerFactory<T>,
	logger: ILogger | undefined,
) {
	const customizations = await (resourceFactory.customize
		? resourceFactory.customize(config).catch((error) => {
				prefixErrorLabel(error, "resourceFactory:customize");
				throw error;
		  })
		: undefined);
	const resources = await resourceFactory.create(config, customizations).catch((error) => {
		prefixErrorLabel(error, "resourceFactory:create");
		throw error;
	});
	const runner = await runnerFactory.create(resources).catch((error) => {
		prefixErrorLabel(error, "runnerFactory:create");
		throw error;
	});

	// Start the runner and then listen for the message to stop it
	const runningP = runner.start(logger).catch(async (error) => {
		prefixErrorLabel(error, "runner:start");
		logger?.error(`Encountered exception while running service: ${serializeError(error)}`);
		Lumberjack.error(`Encountered exception while running service`, undefined, error);
		await runner.stop().catch((innerError) => {
			logger?.error(`Could not stop runner due to error: ${innerError}`);
			Lumberjack.error(`Could not stop runner due to error`, undefined, innerError);
			error.forceKill = true;
			error.runnerStopException = innerError;
		});
		throw error;
	});

	process.on("SIGTERM", () => {
		Lumberjack.info(`Received SIGTERM request to stop the service.`);
		runner.stop("sigterm").catch((error) => {
			logger?.error(`Could not stop runner after SIGTERM due to error: ${error}`);
			Lumberjack.error(`Could not stop runner after SIGTERM due to error`, undefined, error);
		});
	});

	process.on("uncaughtException", (uncaughtException, origin) => {
		Lumberjack.error(
			`Encountered uncaughtException while running service`,
			{ origin },
			uncaughtException,
		);
		runner.stop("uncaughtException", uncaughtException).catch((innerError) => {
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

	process.on("SIGINT", () => {
		Lumberjack.info(`Received SIGINT request to stop the service.`);
	});
	process.on("SIGQUIT", () => {
		Lumberjack.info(`Received SIGQUIT request to stop the service.`);
	});
	process.on("SIGHUP", () => {
		Lumberjack.info(`Received SIGHUP request to stop the service.`);
	});

	try {
		// Wait for the runner to complete
		await runningP;
	} finally {
		try {
			// And then dispose of any resources
			await resources.dispose();
		} catch (err) {
			Lumberjack.error(`Could not dispose the resources due to error`, undefined, err);
		}
	}
}

/**
 * Variant of run that is used to fully run a service. It configures base settings such as logging. And then will
 * exit the service once the runner completes.
 * @internal
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

	const configDumpEnabled = (config.get("config:configDumpEnabled") as boolean) ?? false;
	if (configDumpEnabled) {
		const secretNamesToRedactInConfigDump =
			(config.get("config:secretNamesToRedactInConfigDump") as string[]) ?? undefined;
		const configDumper = new ConfigDumper(
			config.get(),
			logger,
			secretNamesToRedactInConfigDump,
		);
		configDumper.dumpConfig();
	}
	const waitInMs = waitBeforeExitInMs ?? 1000;
	const runnerMetric = Lumberjack.newLumberMetric(LumberEventName.RunService);
	const runningP = run(config, resourceFactory, runnerFactory, logger);

	runningP
		.then(async () => {
			await executeAndWait(() => {
				logger?.info("Exiting");
				runnerMetric.success(`${group} exiting.`);
			}, waitInMs);
			process.exit(0);
		})
		.catch(async (error) => {
			runnerMetric.setProperties({
				[CommonProperties.restartReason]: error?.uncaughtException
					? "uncaughtException"
					: undefined,
				[CommonProperties.errorLabel]: error?.errorLabel,
				[CommonProperties.isGlobalDb]: error?.isGlobalDb,
			});
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
		});
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

/**
 * Prefixes a caught error if possible.
 * ```ts
 * asyncCall().catch((error: any) => {
 *   prefixErrorLabel(error, "my:prefix");
 *   log("AsyncCall Failed", error);
 * });
 * // Example Result: "AsyncCall Failed" { errorLabel: "my:prefix" }
 * ```
 */
function prefixErrorLabel(error: any, prefix: string): void {
	if (typeof error !== "object" || error === null) return;
	const errorLabel = [prefix];
	if (error.errorLabel) {
		errorLabel.push(error.errorLabel);
	}
	error.errorLabel = errorLabel.join(":");
}
