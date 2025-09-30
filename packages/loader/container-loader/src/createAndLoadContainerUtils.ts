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
import { LoaderHeader, ConnectionState } from "@fluidframework/container-definitions/internal";
import type {
	ConfigTypes,
	FluidObject,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
	IResponse,
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
	type IFluidErrorBase,
	createChildMonitoringContext,
	mixinMonitoringContext,
	sessionStorageConfigProvider,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { DebugLogger } from "./debugLogger.js";
import { FrozenDocumentServiceFactory } from "./frozenServices.js";
import { Loader } from "./loader.js";
import { pkgVersion } from "./packageVersion.js";
import type { ProtocolHandlerBuilder } from "./protocol.js";
import { summarizerRequestUrl } from "./summarizerResultTypes.js";
import type {
	LoadSummarizerSummaryResult,
	OnDemandSummaryResults,
	SummarizeOnDemandResults,
} from "./summarizerResultTypes.js";

interface OnDemandSummarizeResultsPromises {
	readonly summarySubmitted: Promise<SummarizeOnDemandResults["summarySubmitted"]>;
	readonly summaryOpBroadcasted: Promise<SummarizeOnDemandResults["summaryOpBroadcasted"]>;
	readonly receivedSummaryAckOrNack: Promise<
		SummarizeOnDemandResults["receivedSummaryAckOrNack"]
	>;
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
export interface ILoadFrozenContainerFromPendingStateProps {
	/**
	 * The code loader handles loading the necessary code for running a container once it is loaded.
	 */
	readonly codeLoader: ICodeDetailsLoader;

	/**
	 * The url resolver used by the loader for resolving external urls into Fluid urls.
	 */
	readonly urlResolver: IUrlResolver;

	/**
	 * The request to resolve the container.
	 */
	readonly request: IRequest;

	/**
	 * Pending local state to be applied to the container.
	 */
	readonly pendingLocalState: string;

	/**
	 * A property bag of options/policies used by various layers to control features.
	 */
	readonly options?: IContainerPolicies | undefined;

	/**
	 * Scope is provided to all container and is a set of shared services for container's to integrate with their host environment.
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
	 * Client details provided in the override will be merged over the default client.
	 */
	readonly clientDetailsOverride?: IClientDetails | undefined;
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
		documentServiceFactory: new FrozenDocumentServiceFactory(),
	});
}

/**
 * Loads a summarizer container with the required headers, triggers an on-demand summary, and then closes it.
 * Returns success/failure and an optional error for host-side handling.
 *
 * @beta
 */
export async function loadSummarizerContainerAndMakeSummary(
	loadExistingContainerProps: ILoadExistingContainerProps,
): Promise<LoadSummarizerSummaryResult> {
	const { logger, configProvider, request: originalRequest } = loadExistingContainerProps;
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
	const loader = new Loader(loadExistingContainerProps);
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

	const container = await loader.resolve(request);

	mc.logger.send({
		category: "generic",
		eventName: "summarizerContainer_created",
		requestUrl: originalRequest.url,
	});

	let success = false;
	let caughtError: IFluidErrorBase | undefined;
	let summarySubmitted: SummarizeOnDemandResults["summarySubmitted"];
	let summaryOpBroadcasted: SummarizeOnDemandResults["summaryOpBroadcasted"];
	let receivedSummaryAckOrNack: SummarizeOnDemandResults["receivedSummaryAckOrNack"];
	try {
		if (container.connectionState !== ConnectionState.Connected) {
			await new Promise<void>((resolve) => container.once("connected", () => resolve()));
		}

		let fluidObject: FluidObject<SummarizerLike> | undefined;
		// Back-compat: Older containers may not implement getEntryPoint().
		if (container.getEntryPoint === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
			const response = (await (container as any).request({
				url: `/${summarizerRequestUrl}`,
			})) as IResponse;
			if (response.status !== 200 || response.mimeType !== "fluid/object") {
				throw new GenericError("Summarizer entry point request failed");
			}
			fluidObject = response.value as FluidObject<SummarizerLike>;
		} else {
			fluidObject = (await container.getEntryPoint()) as FluidObject<SummarizerLike>;
		}
		const summarizer = fluidObject?.ISummarizer;
		if (summarizer === undefined) {
			throw new GenericError("Summarizer entry point not available");
		}
		// Host controlled feature gate for fullTree
		// Default value will be false
		const raw: ConfigTypes | undefined = mc.config.getRawConfig?.(
			"Fluid.Summarizer.FullTree.OnDemand",
		);
		const fullTreeGate = typeof raw === "boolean" ? raw : false;

		const summarizeResults: OnDemandSummarizeResultsPromises = summarizer.summarizeOnDemand({
			reason: "summaryOnRequest",
			retryOnFailure: true,
			fullTree: fullTreeGate,
		});
		[summarySubmitted, summaryOpBroadcasted, receivedSummaryAckOrNack] = await Promise.all([
			summarizeResults.summarySubmitted,
			summarizeResults.summaryOpBroadcasted,
			summarizeResults.receivedSummaryAckOrNack,
		]);

		const summaryResults: OnDemandSummaryResults = {
			summarySubmitted: summarySubmitted.success,
			summaryInfo: summarySubmitted.success
				? {
						stage: summarySubmitted.data.stage,
						summaryTree: summarySubmitted.data.summaryTree,
						handle: receivedSummaryAckOrNack.success
							? receivedSummaryAckOrNack.data.summaryAckOp.contents.handle
							: undefined,
					}
				: {},
			summaryOpBroadcasted: summaryOpBroadcasted.success,
			receivedSummaryAck: receivedSummaryAckOrNack.success,
		};
		success = true;
		return {
			success: true,
			summaryResults,
		};
	} catch (error) {
		caughtError = normalizeError(error);
		return { success: false, error: caughtError };
	} finally {
		container.dispose();
		mc.logger.send({
			category: "generic",
			eventName: "summarizerContainer_closed",
			requestUrl: originalRequest.url,
			success,
			error: success ? undefined : caughtError?.message,
		});
	}
}
