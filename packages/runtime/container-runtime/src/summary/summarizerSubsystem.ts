/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDeltaManager,
	IDeltaManagerFull,
	ILoader,
} from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import type { IClientDetails, IQuorumClients } from "@fluidframework/driver-definitions";
import {
	type IDocumentMessage,
	type ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeFeature,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { addBlobToSummary } from "@fluidframework/runtime-utils/internal";
import {
	type MonitoringContext,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import type { ContainerRuntime, ISummaryRuntimeOptions } from "../containerRuntime.js";
import { Throttler, formExponentialFn } from "../throttler.js";

import {
	type ISerializedElection,
	OrderedClientCollection,
	OrderedClientElection,
} from "./orderedClientElection.js";
import { SummarizerClientElection } from "./summarizerClientElection.js";
import type { IConnectableRuntime, ISummaryConfiguration } from "./summarizerTypes.js";
import { SummaryCollection } from "./summaryCollection.js";
import type { Summarizer } from "./summaryDelayLoadedModule/index.js";
import { electedSummarizerBlobName } from "./summaryFormat.js";
import {
	formCreateSummarizerFn,
	isSummariesDisabled,
	isSummaryOnRequest,
} from "./summaryHelpers.js";
import { SummaryManager } from "./summaryManager.js";

/**
 * Dependencies the summarizer subsystem needs from the container runtime.
 *
 * @internal
 */
export interface SummarizerSubsystemDeps {
	/**
	 * The container runtime instance. Passed to `Summarizer` and `SummaryManager`
	 * as `ISummarizerRuntime` / `IConnectedState` / `ISummarizerInternalsProvider`.
	 */
	readonly runtime: ContainerRuntime;
	readonly handleContext: IFluidHandleContext;
	readonly baseLogger: ITelemetryBaseLogger;
	readonly mc: MonitoringContext;
	/** Resolved at call time — the active summary config can change. */
	readonly getSummaryConfiguration: () => ISummaryConfiguration;
	readonly summaryRuntimeOptions: ISummaryRuntimeOptions;
	readonly isSummarizerClient: boolean;
	readonly clientDetails: IClientDetails;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	readonly innerDeltaManager: IDeltaManagerFull;
	readonly quorum: IQuorumClients;
	readonly electedSummarizerData: ISerializedElection | undefined;
	readonly loader: ILoader;
	readonly emit: (event: string, ...args: unknown[]) => void;
	readonly summariesDisabled: boolean;
}

/**
 * Owns the summarizer-related machinery: `SummaryManager`, `SummarizerClientElection`,
 * and (on summarizer clients) the `Summarizer` instance itself.
 *
 * @remarks
 * Implements {@link IRuntimeFeature}. Construction of `SummaryManager`/election/
 * `Summarizer` happens lazily in `onLoadFromSnapshot`, which the runtime drives
 * during load. Disposal is centralized in `dispose`.
 *
 * Lifted from `ContainerRuntime.initializeSummarizer`.
 *
 * @internal
 */
export class SummarizerSubsystem implements IRuntimeFeature {
	private _summaryManager: SummaryManager | undefined;
	private _summarizerClientElection: SummarizerClientElection | undefined;
	private _summarizer: Summarizer | undefined;

	public constructor(private readonly deps: SummarizerSubsystemDeps) {}

	/** The {@link SummaryManager}, if constructed. */
	public get summaryManager(): SummaryManager | undefined {
		return this._summaryManager;
	}

	/** The {@link SummarizerClientElection}, if constructed. */
	public get summarizerClientElection(): SummarizerClientElection | undefined {
		return this._summarizerClientElection;
	}

	/**
	 * The summarizer instance for this client, if this is a summarizer client.
	 * Undefined for interactive clients.
	 */
	public get summarizer(): Summarizer | undefined {
		return this._summarizer;
	}

	/** Currently-elected summarizer client id, if any. */
	public get electedClientId(): string | undefined {
		return this._summarizerClientElection?.electedClientId;
	}

	/** Disposes both the summary manager and the summarizer (if present). */
	public dispose(): void {
		if (this._summaryManager !== undefined) {
			this._summaryManager.dispose();
		}
		this._summarizer?.dispose();
	}

	public contributeSummary(summaryTree: ISummaryTreeWithStats): void {
		const election = this._summarizerClientElection;
		if (election !== undefined) {
			addBlobToSummary(
				summaryTree,
				electedSummarizerBlobName,
				JSON.stringify(election.serialize()),
			);
		}
	}

	public async onLoadFromSnapshot(): Promise<void> {
		const deps = this.deps;
		if (deps.summariesDisabled) {
			deps.mc.logger.sendTelemetryEvent({ eventName: "SummariesDisabled" });
			return;
		}

		const summaryConfiguration = deps.getSummaryConfiguration();
		const { maxOpsSinceLastSummary = 0, initialSummarizerDelayMs = 0 } = isSummariesDisabled(
			summaryConfiguration,
		)
			? {}
			: {
					...summaryConfiguration,
					initialSummarizerDelayMs:
						// back-compat: initialSummarizerDelayMs was moved from ISummaryRuntimeOptions
						//   to ISummaryConfiguration in 0.60.
						deps.summaryRuntimeOptions.initialSummarizerDelayMs ??
						summaryConfiguration.initialSummarizerDelayMs,
				};

		const summaryCollection = new SummaryCollection(deps.deltaManager, deps.baseLogger);
		const onRequestMode = isSummaryOnRequest(summaryConfiguration);

		if (deps.isSummarizerClient) {
			// We want to dynamically import any thing inside summaryDelayLoadedModule module only when we are the summarizer client,
			// so that all non summarizer clients don't have to load the code inside this module.
			const module = await import(
				/* webpackChunkName: "summarizerDelayLoadedModule" */ "./index.js"
			);
			this._summarizer = new module.Summarizer(
				deps.runtime /* ISummarizerRuntime */,
				deps.getSummaryConfiguration,
				deps.runtime /* ISummarizerInternalsProvider */,
				deps.handleContext,
				summaryCollection,

				async (runtime: IConnectableRuntime) =>
					module.RunWhileConnectedCoordinator.create(
						runtime,
						// Summarization runs in summarizer client and needs access to the real (non-proxy) active
						// information. The proxy delta manager would always return false for summarizer client.
						() => deps.innerDeltaManager.active,
					),
			);
		} else if (
			!onRequestMode &&
			SummarizerClientElection.clientDetailsPermitElection(deps.clientDetails)
		) {
			// Only create a SummaryManager and SummarizerClientElection
			// if summaries are enabled and we are not the summarizer client.
			const orderedClientLogger = createChildLogger({
				logger: deps.baseLogger,
				namespace: "OrderedClientElection",
			});
			const orderedClientCollection = new OrderedClientCollection(
				orderedClientLogger,
				deps.innerDeltaManager,
				deps.quorum,
			);
			const orderedClientElectionForSummarizer = new OrderedClientElection(
				orderedClientLogger,
				orderedClientCollection,
				deps.electedSummarizerData ?? deps.innerDeltaManager.lastSequenceNumber,
				SummarizerClientElection.isClientEligible,
				deps.mc.config.getBoolean(
					"Fluid.ContainerRuntime.OrderedClientElection.EnablePerformanceEvents",
				),
			);

			this._summarizerClientElection = new SummarizerClientElection(
				orderedClientLogger,
				summaryCollection,
				orderedClientElectionForSummarizer,
				maxOpsSinceLastSummary,
			);

			const defaultAction = (): void => {
				if (summaryCollection.opsSinceLastAck > maxOpsSinceLastSummary) {
					deps.mc.logger.sendTelemetryEvent({
						eventName: "SummaryStatus:Behind",
						opsWithoutSummary: summaryCollection.opsSinceLastAck,
					});
					// unregister default to no log on every op after falling behind
					// and register summary ack handler to re-register this handler
					// after successful summary
					summaryCollection.once(MessageType.SummaryAck, () => {
						deps.mc.logger.sendTelemetryEvent({
							eventName: "SummaryStatus:CaughtUp",
						});
						// we've caught up, so re-register the default action to monitor for
						// falling behind, and unregister ourself
						summaryCollection.on("default", defaultAction);
					});
					summaryCollection.off("default", defaultAction);
				}
			};

			summaryCollection.on("default", defaultAction);

			// Create the SummaryManager and mark the initial state
			this._summaryManager = new SummaryManager(
				this._summarizerClientElection,
				deps.runtime, // IConnectedState
				summaryCollection,
				deps.baseLogger,
				formCreateSummarizerFn(deps.loader),
				new Throttler(
					60 * 1000, // 60 sec delay window
					30 * 1000, // 30 sec max delay
					// throttling function increases exponentially (0ms, 40ms, 80ms, 160ms, etc)
					formExponentialFn({ coefficient: 20, initialDelay: 0 }),
				),
				{
					initialDelayMs: initialSummarizerDelayMs,
				},
			);
			// Forward events from SummaryManager
			for (const eventName of [
				"summarize",
				"summarizeAllAttemptsFailed",
				"summarizerStop",
				"summarizerStart",
				"summarizerStartupFailed",
				"summarizeTimeout",
			] as const) {
				this._summaryManager.on(eventName, (...args: unknown[]) => {
					deps.emit(eventName, ...args);
				});
			}

			this._summaryManager.start();
		}
	}
}
