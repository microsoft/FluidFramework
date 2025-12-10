/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainer,
	ICodeDetailsLoader,
	IFluidCodeDetails,
	IContainerPolicies,
} from "@fluidframework/container-definitions/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type {
	FluidObject,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IClientDetails } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import {
	GenericError,
	normalizeError,
	createChildMonitoringContext,
	mixinMonitoringContext,
	sessionStorageConfigProvider,
	PerformanceEvent,
	isFluidError,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { DebugLogger } from "./debugLogger.js";
import { createFrozenDocumentServiceFactory } from "./frozenServices.js";
import { Loader } from "./loader.js";
import { pkgVersion } from "./packageVersion.js";
import type { ProtocolHandlerBuilder } from "./protocol.js";
import type {
	LoadSummarizerSummaryResult,
	OnDemandSummaryResults,
	SummarizeOnDemandResults,
} from "./summarizerResultTypes.js";

interface OnDemandSummarizeResultsPromises {
	readonly summarySubmitted: Promise<SummarizeOnDemandResults["summarySubmitted"]>;
	readonly summaryOpBroadcasted: Promise<SummarizeOnDemandResults["summaryOpBroadcasted"]>;
}

interface OnDemandSummarizeOptions {
	readonly reason?: string;
	readonly retryOnFailure?: boolean;
	readonly fullTree?: boolean;
}

interface SummarizerLike {
	readonly ISummarizer?: SummarizerLike;
	summarizeOnDemand(options: OnDemandSummarizeOptions): OnDemandSummarizeResultsPromises;
}

/**
 * Properties necessary for creating and loading a container.
 * @legacy @beta
 */
export interface ICreateAndLoadContainerProps {
	/**
	 * The url resolver used by the loader for resolving external urls
	 * into Fluid urls such that the container specified by the
	 * external url can be loaded.
	 */
	readonly urlResolver: IUrlResolver;
	/**
	 * The document service factory take the Fluid url provided
	 * by the resolved url and constructs all the necessary services
	 * for communication with the container's server.
	 */
	readonly documentServiceFactory: IDocumentServiceFactory;
	/**
	 * The code loader handles loading the necessary code
	 * for running a container once it is loaded.
	 */
	readonly codeLoader: ICodeDetailsLoader;

	/**
	 * A property bag of options/policies used by various layers
	 * to control features
	 */
	readonly options?: IContainerPolicies | undefined;

	/**
	 * Scope is provided to all container and is a set of shared
	 * services for container's to integrate with their host environment.
	 */
	readonly scope?: FluidObject | undefined;

	/**
	 * The logger that all telemetry should be pushed to.
	 */
	readonly logger?: ITelemetryBaseLogger | undefined;

	/**
	 * The configuration provider which may be used to control features.
	 */
	readonly configProvider?: IConfigProviderBase | undefined;

	/**
	 * Optional property for allowing the container to use a custom
	 * protocol implementation for handling the quorum and/or the audience.
	 */
	readonly protocolHandlerBuilder?: ProtocolHandlerBuilder | undefined;

	/**
	 * Disables the Container from reconnecting if false, allows reconnect otherwise.
	 */
	readonly allowReconnect?: boolean | undefined;

	/**
	 * Client details provided in the override will be merged over the default client.
	 */
	readonly clientDetailsOverride?: IClientDetails | undefined;
}

/**
 * Props used to load a container.
 * @legacy @beta
 */
export interface ILoadExistingContainerProps extends ICreateAndLoadContainerProps {
	/**
	 * The request to resolve the container.
	 */
	readonly request: IRequest;

	/**
	 * Pending local state to be applied to the container.
	 */
	readonly pendingLocalState?: string | undefined;
}

/**
 * Props used to load summarizer container.
 * @legacy @alpha
 */
export type ILoadSummarizerContainerProps = Omit<
	ILoadExistingContainerProps,
	"pendingLocalState"
>;

/**
 * Props used to create a detached container.
 * @legacy @beta
 */
export interface ICreateDetachedContainerProps extends ICreateAndLoadContainerProps {
	/**
	 * The code details for the container to be created.
	 */
	readonly codeDetails: IFluidCodeDetails;
}

/**
 * Props used to rehydrate a detached container.
 * @legacy @beta
 */
export interface IRehydrateDetachedContainerProps extends ICreateAndLoadContainerProps {
	/**
	 * The serialized state returned by calling serialize on another container
	 */
	readonly serializedState: string;
}

/**
 * Creates a new container using the specified code details but in an unattached state. While unattached, all
 * updates will only be local until the user explicitly attaches the container to a service provider.
 * @param createDetachedContainerProps - Services and properties necessary for creating detached container.
 * @legacy @beta
 */
export async function createDetachedContainer(
	createDetachedContainerProps: ICreateDetachedContainerProps,
): Promise<IContainer> {
	const loader = new Loader(createDetachedContainerProps);
	return loader.createDetachedContainer(createDetachedContainerProps.codeDetails, {
		canReconnect: createDetachedContainerProps.allowReconnect,
		clientDetailsOverride: createDetachedContainerProps.clientDetailsOverride,
	});
}

/**
 * Creates a new container using the specified snapshot but in an unattached state. While unattached, all
 * updates will only be local until the user explicitly attaches the container to a service provider.
 * @param rehydrateDetachedContainerProps - Services and properties necessary for rehydrating detached container from a previously serialized container's state.
 * @legacy @beta
 */
export async function rehydrateDetachedContainer(
	rehydrateDetachedContainerProps: IRehydrateDetachedContainerProps,
): Promise<IContainer> {
	const loader = new Loader(rehydrateDetachedContainerProps);
	return loader.rehydrateDetachedContainerFromSnapshot(
		rehydrateDetachedContainerProps.serializedState,
		{
			canReconnect: rehydrateDetachedContainerProps.allowReconnect,
			clientDetailsOverride: rehydrateDetachedContainerProps.clientDetailsOverride,
		},
	);
}

/**
 * Loads a container with an existing snapshot from the service.
 * @param loadExistingContainerProps - Services and properties necessary for loading an existing container.
 * @legacy @beta
 */
export async function loadExistingContainer(
	loadExistingContainerProps: ILoadExistingContainerProps,
): Promise<IContainer> {
	const loader = new Loader(loadExistingContainerProps);
	return loader.resolve(
		loadExistingContainerProps.request,
		loadExistingContainerProps.pendingLocalState,
	);
}

/**
 * Properties required to load a frozen container from pending state.
 * @legacy @alpha
 */
export interface ILoadFrozenContainerFromPendingStateProps
	extends ILoadExistingContainerProps {
	/**
	 * Pending local state to be applied to the container.
	 */
	readonly pendingLocalState: string;
}

/**
 * Loads a frozen container from pending local state.
 * @param props - Properties required to load a frozen container from pending state.
 * @legacy @alpha
 */
export async function loadFrozenContainerFromPendingState(
	props: ILoadFrozenContainerFromPendingStateProps,
): Promise<IContainer> {
	return loadExistingContainer({
		...props,
		documentServiceFactory: createFrozenDocumentServiceFactory(props.documentServiceFactory),
	});
}

/**
 * Loads a summarizer container with the required headers, triggers an on-demand summary, and then closes it.
 * Returns success/failure and an optional error for host-side handling.
 *
 * @legacy @alpha
 */
export async function loadSummarizerContainerAndMakeSummary(
	loadSummarizerContainerProps: ILoadSummarizerContainerProps,
): Promise<LoadSummarizerSummaryResult> {
	let result = await loadSummarizerContainerAndMakeSummaryInternal(
		loadSummarizerContainerProps,
	);
	if (!result.success) {
		/**
		 * We retry once as there is potential for a race condition when loading a snapshot.
		 * If the newest snapshot is not ready when creating the container but becomes available upon catching up, the container
		 * will be closed so it can load from the new snapshot.
		 */
		result = await loadSummarizerContainerAndMakeSummaryInternal(loadSummarizerContainerProps);
	}
	return result;
}

async function loadSummarizerContainerAndMakeSummaryInternal(
	loadSummarizerContainerProps: ILoadSummarizerContainerProps,
): Promise<LoadSummarizerSummaryResult> {
	const { logger, configProvider, request: originalRequest } = loadSummarizerContainerProps;
	const telemetryProps = {
		loaderId: uuid(),
		loaderVersion: pkgVersion,
	};

	const subMc = mixinMonitoringContext(
		DebugLogger.mixinDebugLogger("fluid:telemetry", logger, {
			all: telemetryProps,
		}),
		sessionStorageConfigProvider.value,
		configProvider,
	);
	const mc = createChildMonitoringContext({
		logger: subMc.logger,
		namespace: "SummarizerOnDemand",
	});
	return PerformanceEvent.timedExecAsync(
		mc.logger,
		{ eventName: "SummarizerOnDemandSummary" },
		async (event) => {
			const baseHeaders = originalRequest.headers;
			const request = {
				...originalRequest,
				headers: {
					...baseHeaders,
					[LoaderHeader.cache]: false,
					[LoaderHeader.clientDetails]: {
						capabilities: { interactive: false },
						type: "summarizer",
					},
					[DriverHeader.summarizingClient]: true,
					[LoaderHeader.reconnect]: false,
				},
			};

			const container = await loadExistingContainer({
				...loadSummarizerContainerProps,
				request,
			});

			let summarySubmitted: SummarizeOnDemandResults["summarySubmitted"];
			let summaryOpBroadcasted: SummarizeOnDemandResults["summaryOpBroadcasted"];
			try {
				if (container.getEntryPoint === undefined) {
					throw new GenericError("container.getEntryPoint() is undefined");
				}
				const fluidObject = (await container.getEntryPoint()) as FluidObject<SummarizerLike>;
				const summarizer = fluidObject?.ISummarizer;
				if (summarizer === undefined) {
					throw new GenericError("Summarizer entry point not available");
				}
				// Host controlled feature gate for fullTree
				// Default value will be false
				const fullTreeGate =
					mc.config.getBoolean("Fluid.Summarizer.FullTree.OnDemand") === true;

				const summarizeResults: OnDemandSummarizeResultsPromises =
					summarizer.summarizeOnDemand({
						reason: "summaryOnRequest",
						retryOnFailure: true,
						fullTree: fullTreeGate,
					});
				[summarySubmitted, summaryOpBroadcasted] = await Promise.all([
					summarizeResults.summarySubmitted,
					summarizeResults.summaryOpBroadcasted,
				]);

				const summaryResults: OnDemandSummaryResults = {
					summarySubmitted: summarySubmitted.success,
					summaryInfo: summarySubmitted.success
						? {
								stage: summarySubmitted.data.stage,
								handle: summaryOpBroadcasted.success
									? summaryOpBroadcasted.data.summarizeOp.contents.handle
									: undefined,
							}
						: {},
					summaryOpBroadcasted: summaryOpBroadcasted.success,
				};

				if (summarySubmitted.success && summaryOpBroadcasted.success) {
					event.end({
						success: true,
						summarySubmitted: true,
						summaryOpBroadcasted: true,
					});
					return {
						success: true,
						summaryResults,
					};
				}

				const failureError =
					summarySubmitted.success === false
						? summarySubmitted.error
						: summaryOpBroadcasted.success === false
							? summaryOpBroadcasted.error
							: new GenericError("On demand summary failed");

				event.end({
					success: false,
					summarySubmitted: summarySubmitted.success,
					summaryOpBroadcasted: summaryOpBroadcasted.success,
				});
				return {
					success: false,
					error: failureError,
				};
			} catch (error) {
				event.cancel({ success: false }, error);
				const caughtError = isFluidError(error) ? error : normalizeError(error);
				return { success: false, error: caughtError };
			} finally {
				container.dispose();
			}
		},
		{ start: true, end: true, cancel: "generic" },
	);
}
