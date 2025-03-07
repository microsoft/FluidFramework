/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ILoader, LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import { responseToException } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { summarizerClientType } from "./summarizerClientElection.js";
import type {
	ISummarizer,
	ISummaryConfiguration,
	ISummaryConfigurationDisableSummarizer,
	ISummaryConfigurationHeuristics,
} from "./summarizerTypes.js";

export const summarizerRequestUrl = "_summarizer";

export function isSummariesDisabled(
	config: ISummaryConfiguration,
): config is ISummaryConfigurationDisableSummarizer {
	return config.state === "disabled";
}

/**
 * @legacy
 * @alpha
 */
export const DefaultSummaryConfiguration: ISummaryConfiguration = {
	state: "enabled",

	minIdleTime: 0,

	maxIdleTime: 30 * 1000, // 30 secs.

	maxTime: 60 * 1000, // 1 min.

	maxOps: 100, // Summarize if 100 weighted ops received since last snapshot.

	minOpsForLastSummaryAttempt: 10,

	maxAckWaitTime: 3 * 60 * 1000, // 3 mins.

	maxOpsSinceLastSummary: 7000,

	initialSummarizerDelayMs: 5 * 1000, // 5 secs.

	nonRuntimeOpWeight: 0.1,

	runtimeOpWeight: 1,

	nonRuntimeHeuristicThreshold: 20,
};

/**
 * Returns a function that will create and retrieve a Summarizer.
 */
export function formCreateSummarizerFn(loader: ILoader): () => Promise<ISummarizer> {
	return async () => {
		const request: IRequest = {
			headers: {
				[LoaderHeader.cache]: false,
				[LoaderHeader.clientDetails]: {
					capabilities: { interactive: false },
					type: summarizerClientType,
				},
				[DriverHeader.summarizingClient]: true,
				[LoaderHeader.reconnect]: false,
			},
			url: `/${summarizerRequestUrl}`,
		};

		const resolvedContainer = await loader.resolve(request);
		let fluidObject: FluidObject<ISummarizer> | undefined;

		// Older containers may not have the "getEntryPoint" API
		// ! This check will need to stay until LTS of loader moves past 2.0.0-internal.7.0.0
		if (resolvedContainer.getEntryPoint === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
			const response = (await (resolvedContainer as any).request({
				url: `/${summarizerRequestUrl}`,
			})) as IResponse;
			if (response.status !== 200 || response.mimeType !== "fluid/object") {
				throw responseToException(response, request);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			fluidObject = response.value;
		} else {
			fluidObject = await resolvedContainer.getEntryPoint();
		}

		if (fluidObject?.ISummarizer === undefined) {
			throw new UsageError("Fluid object does not implement ISummarizer");
		}
		return fluidObject.ISummarizer;
	};
}

export function validateSummaryHeuristicConfiguration(
	configuration: ISummaryConfigurationHeuristics,
): void {
	// eslint-disable-next-line no-restricted-syntax
	for (const prop in configuration) {
		if (typeof configuration[prop] === "number" && configuration[prop] < 0) {
			throw new UsageError(
				`Summary heuristic configuration property "${prop}" cannot be less than 0`,
			);
		}
	}
	if (configuration.minIdleTime > configuration.maxIdleTime) {
		throw new UsageError(
			`"minIdleTime" [${configuration.minIdleTime}] cannot be greater than "maxIdleTime" [${configuration.maxIdleTime}]`,
		);
	}
}
