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
import type { AllOrNone } from "@fluidframework/core-interfaces/internal";
import { validateAllOrNone } from "@fluidframework/core-utils/internal";
import type { IClientDetails } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	IResolvedUrl,
	ISequencedDocumentMessage,
	ISnapshot,
	ISnapshotTree,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { DriverHeader, FetchSource } from "@fluidframework/driver-definitions/internal";
import { getSnapshotTree } from "@fluidframework/driver-utils/internal";
import {
	GenericError,
	UsageError,
	normalizeError,
	createChildMonitoringContext,
	mixinMonitoringContext,
	sessionStorageConfigProvider,
	PerformanceEvent,
	isFluidError,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	captureReferencedAttachmentBlobs,
	extractBlobAttachReferences,
	inlineAttachmentBlobsByReference,
	parseGcSnapshotData,
	readReferencedSnapshotBlobs,
	snapshotHasLoadingGroups,
	unreferencedAttachmentBlobLocalIds,
	type IBlobAttachReference,
} from "./captureReferencedContents.js";
import { DebugLogger } from "./debugLogger.js";
import { createFrozenDocumentServiceFactory } from "./frozenServices.js";
import { Loader } from "./loader.js";
import { pkgVersion } from "./packageVersion.js";
import type { ProtocolHandlerBuilder } from "./protocol.js";
import type { IPendingContainerState } from "./serializedStateManager.js";
import type {
	LoadSummarizerSummaryResult,
	OnDemandSummaryResults,
	SummarizeOnDemandResults,
} from "./summarizerResultTypes.js";
import {
	getAttachedContainerStateFromSerializedContainer,
	getDocumentAttributes,
	tryParseCompatibleResolvedUrl,
} from "./utils.js";

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
 * Host-level container loader properties — the code loader plus all the
 * optional policy / observability fields that aren't tied to driver wiring.
 *
 * Extracted as a reusable building block so other props types (create,
 * rehydrate, load, frozen-load) can compose it without duplicating the
 * optional-fields surface.
 *
 * @legacy @beta
 */
export interface IContainerHostProps {
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
 * The driver-services pair — `urlResolver` plus `documentServiceFactory` —
 * required to wire a container to a real driver at create or load time.
 *
 * Extracted as a reusable building block so the `request` field can be
 * added on top for load-time props (see {@link IContainerLoadDriverProps})
 * while create-time props that don't carry a request can compose just this
 * pair.
 *
 * @legacy @beta
 */
export interface IContainerDriverServices {
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
}

/**
 * The load-time driver wiring trio — `request`, `urlResolver`, and
 * `documentServiceFactory` together.
 *
 * @remarks
 * Reused as the all-or-nothing group for entry points (e.g. the frozen-load
 * entry point) that accept either a full driver wiring (online form) or none
 * of it (offline form). See `AllOrNone` in `@fluidframework/core-interfaces`.
 *
 * @legacy @beta
 */
export interface IContainerLoadDriverProps extends IContainerDriverServices {
	/**
	 * The request to resolve the container.
	 */
	readonly request: IRequest;
}

/**
 * Properties necessary for creating and loading a container.
 *
 * @deprecated
 * Use the composable building blocks instead: extend
 * {@link IContainerHostProps} for the code-loader / policy / observability
 * surface and {@link IContainerDriverServices} for the
 * `urlResolver` / `documentServiceFactory` pair, or compose them inline as
 * `IContainerHostProps & IContainerDriverServices`. This interface is kept
 * as an alias for back-compat and will be removed in a future release.
 *
 * @legacy @beta
 */
export interface ICreateAndLoadContainerProps
	extends IContainerHostProps,
		IContainerDriverServices {}

/**
 * Props used to load a container.
 * @legacy @beta
 */
export interface ILoadExistingContainerProps
	extends IContainerHostProps,
		IContainerDriverServices {
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
export interface ICreateDetachedContainerProps
	extends IContainerHostProps,
		IContainerDriverServices {
	/**
	 * The code details for the container to be created.
	 */
	readonly codeDetails: IFluidCodeDetails;
}

/**
 * Props used to rehydrate a detached container.
 * @legacy @beta
 */
export interface IRehydrateDetachedContainerProps
	extends IContainerHostProps,
		IContainerDriverServices {
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
 *
 * @remarks
 * Two forms are supported and selected by the presence of the driver-wiring
 * fields. **Online** form supplies `request`, `urlResolver`, and
 * `documentServiceFactory`; the supplied factory is wrapped in a frozen
 * factory and the resolver is used to re-resolve the request URL just as with
 * {@link loadExistingContainer}. **Offline** form omits all three driver
 * fields; the captured URL stored in `pendingLocalState` is used to
 * synthesize a resolved URL, no real driver is contacted, and
 * `IContainer.getAbsoluteUrl` throws on the returned container because the
 * resolver's external URL format is unknown without a real `IUrlResolver`.
 *
 * **Offline form precondition.** With no driver wiring there is no live
 * storage to read attachment blobs from, so any blob the runtime dereferences
 * during load must already be inlined into `pendingLocalState`. The pending
 * state must therefore be produced by {@link captureFullContainerState}
 * (which inlines all referenced attachment blobs) rather than
 * `IContainer.getPendingLocalState` / `getRequiredPendingLocalState` (which
 * do not). If the runtime needs an attachment blob that is not inlined, the
 * load fails with `UsageError` from the synthesized storage service.
 *
 * **URL shape requirement.** In the offline form the captured
 * `pendingLocalState.url` is the only URL available; it is parsed in place of
 * a real `IUrlResolver.resolve()` call, so it must satisfy
 * {@link tryParseCompatibleResolvedUrl}'s contract — a resolved URL of shape
 * `protocol://<string>/.../..?<querystring>`. This is the format that
 * Fluid-shipped drivers emit; drivers that emit a non-standard resolved-URL
 * shape will surface as a `UsageError` at load time. The online form has no
 * such constraint because the supplied resolver controls URL parsing.
 *
 * The offline form supports `readOnly: false` for the same capture-and-relay
 * use case as the online form: local DDS submissions accrue in the runtime's
 * pending-state manager and can be captured via `getPendingLocalState` for
 * a later online replay. Nothing is published from an offline container.
 *
 * Mixing the two forms (some driver fields supplied, others omitted) is a
 * compile-time error courtesy of the `AllOrNone` modifier from
 * `@fluidframework/core-interfaces`.
 * @legacy @alpha
 */
export type ILoadFrozenContainerFromPendingStateProps = IContainerHostProps & {
	/**
	 * Pending local state to be applied to the container.
	 */
	readonly pendingLocalState: string;

	/**
	 * Controls whether the frozen container is surfaced as read-only.
	 *
	 * Defaults to `true`. When `true`, the container reports `readOnlyInfo.readonly === true`
	 * with `storageOnly === true`, matching the historical behavior of frozen loads.
	 *
	 * When `false`, the container loads as writable so the runtime will accept DDS submissions.
	 * The connection itself stays `Connected`: the connection manager recognizes the synthetic
	 * frozen delta stream and drops outbound messages at the network layer, so no read→write
	 * reconnect is attempted. Local DDS state continues to update via optimistic apply, and
	 * submitted ops accumulate in the runtime's pending-state manager. Use this when callers
	 * want to accrue and capture pending state without publishing it.
	 *
	 * @remarks
	 * The flag uses negative polarity (`readOnly`) rather than a positive opt-in (`writable`)
	 * to align with `IContainer.readOnlyInfo.readonly`, which is the established surface for
	 * read/write state on a loaded container. A future positive-polarity option can layer on
	 * top of this without breaking callers, but flipping the polarity now would split readers
	 * between two conventions for the same concept.
	 *
	 * Subsystem behavior is unchanged from the read-only frozen path regardless of `readOnly`:
	 * storage operations still throw (only `readBlob` is supported); summarizer / id-compressor
	 * never fire because no acks arrive; the quorum is whatever was captured in pending state
	 * and gains no members during the writable-frozen lifetime. The only behavioral delta is
	 * that the runtime accepts DDS submissions and accumulates them in `pendingStateManager`.
	 */
	readonly readOnly?: boolean;
} & AllOrNone<IContainerLoadDriverProps>;

const driverPropKeys = ["request", "urlResolver", "documentServiceFactory"] as const;

// Recognizable opaque placeholder used as `request.url` for the offline form of
// `loadFrozenContainerFromPendingState`. The synthesized `IUrlResolver` ignores
// its argument and returns a `IResolvedUrl` derived from `pendingLocalState.url`,
// so this string is never interpreted as a real URL by any downstream stage; it
// only needs to be a fixed sentinel that won't collide with real request URLs.
const offlineFrozenRequestPlaceholderUrl =
	"frozen-load-from-pending-state://offline-placeholder";

/**
 * Loads a frozen container from pending local state.
 * @param props - Properties required to load a frozen container from pending state.
 * @legacy @alpha
 */
export async function loadFrozenContainerFromPendingState(
	props: ILoadFrozenContainerFromPendingStateProps,
): Promise<IContainer> {
	const fnName = loadFrozenContainerFromPendingState.name;
	const { readOnly, pendingLocalState } = props;

	const driverWiring = validateAllOrNone<IContainerLoadDriverProps>(props, driverPropKeys);

	if (driverWiring === "mixed") {
		throw new UsageError(
			`${fnName}: ${driverPropKeys.join(", ")} must all be provided or all omitted`,
		);
	}

	if (driverWiring === "none") {
		// Offline: synthesize the driver wiring from the URL captured in pending state.
		// The container's load pipeline is reused unchanged — the synthesized resolver
		// returns a resolved URL whose `url` equals `pendingLocalState.url`, so the
		// identity guard in `Loader.resolveCore` is trivially satisfied.
		const pending = getAttachedContainerStateFromSerializedContainer(pendingLocalState);
		const parsed = tryParseCompatibleResolvedUrl(pending.url);
		if (parsed === undefined) {
			throw new UsageError(
				`${fnName}: pending state URL is not in a parseable form (${pending.url})`,
			);
		}
		// `tryParseCompatibleResolvedUrl` returns `parsed.id` as the first two
		// path segments joined by `/` (i.e. `tenantId/docId`). Production
		// resolvers populate `IResolvedUrl.id` with the single doc-id segment
		// (see `localResolver.ts`, `insecureUrlResolver.ts`,
		// `routerlicious-urlResolver/urlResolver.ts`, `odspDriverUrlResolver.ts`),
		// so downstream consumers reading `IContainer.resolvedUrl.id` for
		// telemetry / cache keys expect the single-segment shape. Take the
		// trailing segment so offline-loaded containers match that contract.
		const parsedIdSegments = parsed.id.split("/");
		const synthesizedId = parsedIdSegments[parsedIdSegments.length - 1] ?? parsed.id;
		const synthesizedResolvedUrl: IResolvedUrl = {
			type: "fluid",
			id: synthesizedId,
			url: pending.url,
			// `tokens` and `endpoints` are empty because no real driver is contacted; the
			// frozen factory never reads them. A future offline mode that needs them would
			// require carrying them in the pending-state format.
			tokens: {},
			endpoints: {},
		};
		const synthesizedUrlResolver: IUrlResolver = {
			// The argument is ignored: in offline mode the only URL in the system is the
			// one captured in pending state. Any request is mapped to the same resolved URL.
			resolve: async () => synthesizedResolvedUrl,
			// External (request-form) URLs cannot be reconstructed from the captured
			// resolved URL alone, so we cannot honor `getAbsoluteUrl`. Surface the misuse
			// loudly rather than fabricate a string in the wrong format.
			getAbsoluteUrl: async () => {
				throw new UsageError(`${fnName}: getAbsoluteUrl requires ${driverPropKeys.join("/")}`);
			},
		};
		return loadExistingContainer({
			...props,
			// `request.url` is unused: `synthesizedUrlResolver.resolve()` returns
			// `synthesizedResolvedUrl` regardless of input, and the identity
			// guard in `Loader.resolveCore` compares the resolver's output URL
			// against `pendingLocalState.url` — both equal `pending.url` here.
			// Using a recognizable opaque placeholder instead of the resolved-form
			// URL avoids implying that any downstream stage interprets it as a
			// request-form URL.
			request: { url: offlineFrozenRequestPlaceholderUrl, headers: {} },
			urlResolver: synthesizedUrlResolver,
			documentServiceFactory: createFrozenDocumentServiceFactory(undefined, readOnly),
		});
	}

	// Online: wrap the caller-supplied factory so the live driver only serves blob reads.
	// `driverWiring === "all"` narrows `props` to the form that carries the driver fields.
	const onlineProps = props as ILoadFrozenContainerFromPendingStateProps &
		IContainerLoadDriverProps;
	return loadExistingContainer({
		...onlineProps,
		documentServiceFactory: createFrozenDocumentServiceFactory(
			onlineProps.documentServiceFactory,
			readOnly,
		),
	});
}

/**
 * Properties for {@link captureFullContainerState}.
 * @legacy @alpha
 */
export interface ICaptureFullContainerStateProps {
	/**
	 * The url resolver used to resolve the request into a Fluid resolved url.
	 */
	readonly urlResolver: IUrlResolver;
	/**
	 * The document service factory used to construct the driver services
	 * against which the state is captured.
	 */
	readonly documentServiceFactory: IDocumentServiceFactory;
	/**
	 * The request identifying the container whose state is to be captured.
	 */
	readonly request: IRequest;
	/**
	 * Optional logger for driver-side telemetry.
	 */
	readonly logger?: ITelemetryBaseLogger | undefined;
}

/**
 * Captures the current state of an attached container using only driver-level
 * services, without instantiating a runtime or loading a full container. The
 * returned string is a serialized pending container state in the same wire
 * format produced by a live container's pending-state serialization, and can
 * be handed to {@link loadExistingContainer} as `pendingLocalState`.
 *
 * The output is a self-contained view of the container's referenced graph:
 * the latest snapshot, inlined contents of every blob reachable through
 * referenced subtrees, inlined contents of every referenced attachment blob
 * keyed by storage id, and all ops with sequence numbers after the base
 * snapshot's sequence number (as read from its attributes blob).
 *
 * Reachability respects GC. Snapshot subtrees flagged `unreferenced: true`
 * are skipped (their contents are not inlined). Attachment blobs that GC has
 * marked unreferenced, tombstoned, or deleted are skipped. When the snapshot
 * has no GC tree (GC disabled or pre-GC document), no filtering is applied.
 *
 * Blob reads on load hit the `ContainerStorageAdapter` cache populated from
 * the captured `snapshotBlobs` map, so a frozen loader can serve the full
 * referenced graph without a live storage service.
 *
 * `pendingRuntimeState` is `undefined` — no runtime is instantiated — so the
 * output cannot carry DDS-level in-flight changes. It is intended for state
 * relay, inspection, and durable-state snapshot use cases.
 *
 * Containers that declare loading groups are not yet supported: the function
 * throws `UsageError` if any referenced subtree carries a `groupId`. Group
 * snapshots would need a separate prefetch + serialization path; until there
 * is a known consumer and end-to-end coverage, the capture refuses rather
 * than silently producing pending state that omits group data.
 *
 * Note: if a new snapshot lands between the snapshot fetch and the ops fetch,
 * the returned state may not reflect the very latest snapshot, but remains
 * internally consistent: ops are anchored to the snapshot that was captured.
 *
 * No `mixinMonitoringContext` / `configProvider` is wired here, deliberately
 * diverging from the sibling entry points in this file. The function reads
 * no feature flags and instantiates no runtime, so there is nothing for a
 * monitoring context to gate or attribute. If a future change introduces
 * config-gated behavior or runtime-attributed telemetry, add the wiring
 * back together with that change.
 * @legacy @alpha
 */
export async function captureFullContainerState({
	urlResolver,
	documentServiceFactory,
	request,
	logger,
}: ICaptureFullContainerStateProps): Promise<string> {
	const resolvedUrl = await urlResolver.resolve(request);
	if (resolvedUrl === undefined) {
		throw new UsageError("Failed to resolve request to a Fluid URL");
	}

	// Validate the resolver's URL shape at capture time. The captured pending
	// state is rehydrated later (possibly in a different process) via the
	// offline form of `loadFrozenContainerFromPendingState`, which requires
	// `tryParseCompatibleResolvedUrl` to succeed on `pendingLocalState.url`.
	// Failing fast here turns "your captured artifact silently isn't
	// rehydratable" into a same-call error a partner can act on, instead of
	// surfacing as a `UsageError` at offline-load time in a different process.
	if (tryParseCompatibleResolvedUrl(resolvedUrl.url) === undefined) {
		throw new UsageError(
			`${captureFullContainerState.name}: resolved URL is not in the shape required by tryParseCompatibleResolvedUrl (protocol://<string>/<tenantId>/<docId>?<querystring>); captured state would not rehydrate offline (${resolvedUrl.url})`,
		);
	}

	const documentService = await documentServiceFactory.createDocumentService(
		resolvedUrl,
		logger,
	);
	try {
		const storage = await documentService.connectToStorage();

		const versions = await storage.getVersions(
			// `null` signals "latest"
			// eslint-disable-next-line unicorn/no-null
			null,
			1,
			"captureFullContainerState",
			FetchSource.noCache,
		);
		const version = versions[0];
		const snapshot: ISnapshot | ISnapshotTree | undefined =
			storage.getSnapshot === undefined
				? ((await storage.getSnapshotTree(version, "captureFullContainerState")) ?? undefined)
				: await storage.getSnapshot({
						cacheSnapshot: false,
						versionId: version?.id,
						scenarioName: "captureFullContainerState",
					});
		if (snapshot === undefined) {
			throw new GenericError("Failed to fetch snapshot for captureFullContainerState");
		}

		const baseSnapshot = getSnapshotTree(snapshot);
		if (snapshotHasLoadingGroups(baseSnapshot)) {
			throw new UsageError(
				"captureFullContainerState does not yet support containers with loading groups",
			);
		}
		const attributes = await getDocumentAttributes(storage, baseSnapshot);
		const gcData = await parseGcSnapshotData(baseSnapshot, storage);
		// Structural snapshot blobs (JSON/text the runtime authored) are
		// UTF-8-encoded; attachment blobs may carry arbitrary binary bytes
		// and are base64-encoded. Keep them on separate fields of the
		// pending state so the load side can apply the matching decoder
		// without ambiguity. See IPendingContainerState.attachmentBlobContents.
		const [snapshotBlobs, attachmentBlobContents] = await Promise.all([
			readReferencedSnapshotBlobs(snapshot, storage), // utf8 encoded
			captureReferencedAttachmentBlobs(baseSnapshot, storage, gcData), // base64 encoded
		]);

		const deltaStorage = await documentService.connectToDeltaStorage();
		const opsStream = deltaStorage.fetchMessages(
			attributes.sequenceNumber + 1,
			undefined,
			undefined,
			false,
			"captureFullContainerState",
		);
		const savedOps: ISequencedDocumentMessage[] = [];
		const postSnapshotBlobReferences: IBlobAttachReference[] = [];
		let opsResult = await opsStream.read();
		while (!opsResult.done) {
			for (const op of opsResult.value) {
				savedOps.push(op);
				// Blobs uploaded after the base snapshot are not in its
				// `.blobs` redirect table, so `captureReferencedAttachmentBlobs`
				// did not see them. The wire-format BlobAttach op carries
				// `(localId, storageId)` in its metadata; collect those here so
				// we can backfill the bytes before sealing the artifact.
				const refs = extractBlobAttachReferences(op);
				if (refs.length > 0) {
					postSnapshotBlobReferences.push(...refs);
				}
			}
			opsResult = await opsStream.read();
		}

		if (postSnapshotBlobReferences.length > 0) {
			const added = await inlineAttachmentBlobsByReference(
				postSnapshotBlobReferences,
				storage,
				unreferencedAttachmentBlobLocalIds(gcData),
				attachmentBlobContents,
			);
			Object.assign(attachmentBlobContents, added);
		}

		const pendingState: IPendingContainerState = {
			attached: true,
			baseSnapshot,
			snapshotBlobs,
			attachmentBlobContents:
				Object.keys(attachmentBlobContents).length === 0 ? undefined : attachmentBlobContents,
			loadedGroupIdSnapshots: undefined,
			pendingRuntimeState: undefined,
			savedOps,
			url: resolvedUrl.url,
		};
		return JSON.stringify(pendingState);
	} finally {
		documentService.dispose();
	}
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
