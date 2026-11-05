/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ILoader, LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	summarizerClientType,
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	type ISummarizer,
	type ISummaryConfiguration,
	type ISummaryConfigurationDisableSummarizer,
	type ISummaryConfigurationHeuristics,
} from "./summarizerTypes.js";

export const summarizerRequestUrl = "_summarizer";

export function isSummariesDisabled(
	config: ISummaryConfiguration,
): config is ISummaryConfigurationDisableSummarizer {
	return config.state === "disabled";
}

export function isSummaryOnRequest(config: { state?: string }): boolean {
	return config.state === "summaryOnRequest";
}

/**
 * @legacy @beta
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
// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
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
		try {
			// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
			const entryPoint: FluidObject<ISummarizer> | undefined =
				await resolvedContainer.getEntryPoint();
			const summarizer = entryPoint?.ISummarizer;
			if (summarizer === undefined) {
				throw new UsageError("Fluid object does not implement ISummarizer");
			}
			return summarizer;
		} catch (error) {
			// Until acquisition succeeds, the factory owns cleanup of the summarizer container.
			try {
				resolvedContainer.close();
			} catch {
				// Cleanup must not replace the entry-point or validation error.
			}
			throw error;
		}
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
