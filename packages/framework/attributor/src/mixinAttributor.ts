/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import {
	type IDeltaManager,
	type IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	type FluidObject,
	type IRequest,
	type IResponse,
} from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { type IQuorumClients } from "@fluidframework/driver-definitions";
import {
	type IDocumentMessage,
	type ISnapshotTree,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	type ISummaryTreeWithStats,
	type ITelemetryContext,
	type AttributionInfo,
	type AttributionKey,
	type NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import {
	SummaryTreeBuilder,
	addSummarizeResultToSummary,
} from "@fluidframework/runtime-utils/internal";
import {
	PerformanceEvent,
	UsageError,
	createChildLogger,
	loggerToMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { Attributor, type IAttributor, OpStreamAttributor } from "./attributor.js";
import { AttributorSerializer, type Encoder, chain, deltaEncoder } from "./encoders.js";
import { makeLZ4Encoder } from "./lz4Encoder.js";

// Summary tree keys
const attributorTreeName = ".attributor";
const opBlobName = "op";

/**
 * @internal
 */
export const enableOnNewFileKey = "Fluid.Attribution.EnableOnNewFile";

/**
 * @internal
 */
export const IRuntimeAttributor: keyof IProvideRuntimeAttributor = "IRuntimeAttributor";

/**
 * @internal
 */
export interface IProvideRuntimeAttributor {
	readonly IRuntimeAttributor: IRuntimeAttributor;
}

/**
 * Provides access to attribution information stored on the container runtime.
 *
 * @remarks Attributors are only populated after the container runtime into which they are being injected has initialized.
 *
 * @sealed
 * @internal
 */
export interface IRuntimeAttributor extends IProvideRuntimeAttributor {
	/**
	 * @throws - If no AttributionInfo exists for this key.
	 */
	get(key: AttributionKey): AttributionInfo;

	/**
	 * @returns Whether any AttributionInfo exists for the provided key.
	 */
	has(key: AttributionKey): boolean;

	/**
	 * @returns Whether the runtime is currently tracking attribution information for the loaded container.
	 * If enabled, the runtime attributor can be asked for the attribution info for different keys.
	 * See {@link mixinAttributor} for more details on when this happens.
	 */
	readonly isEnabled: boolean;
}

/**
 * Creates an `IRuntimeAttributor` for usage with {@link mixinAttributor}.
 *
 * @remarks The attributor will only be populated with data once it's passed via scope to a container runtime load flow.
 *
 * @internal
 */
export function createRuntimeAttributor(): IRuntimeAttributor {
	return new RuntimeAttributor();
}

/**
 * Mixes in logic to load and store runtime-based attribution functionality.
 *
 * The `scope` passed to `load` should implement `IProvideRuntimeAttributor`.
 *
 * Existing documents without stored attributors will not start storing attribution information: if an
 * IRuntimeAttributor is passed via scope to load a document that never previously had attribution information,
 * that attributor's `has` method will always return `false`.
 * @param Base - base class, inherits from FluidAttributorRuntime
 * @internal
 */
export const mixinAttributor = (
	Base: typeof ContainerRuntime = ContainerRuntime,
): typeof ContainerRuntime =>
	class ContainerRuntimeWithAttributor extends Base {
		public static async loadRuntime(params: {
			context: IContainerContext;
			registryEntries: NamedFluidDataStoreRegistryEntries;
			existing: boolean;
			runtimeOptions?: IContainerRuntimeOptions;
			containerScope?: FluidObject;
			containerRuntimeCtor?: typeof ContainerRuntime;
			/**
			 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
			 */
			requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>;
			provideEntryPoint: (containerRuntime: IContainerRuntime) => Promise<FluidObject>;
		}): Promise<ContainerRuntime> {
			const {
				context,
				registryEntries,
				existing,
				requestHandler,
				provideEntryPoint,
				runtimeOptions,
				containerScope,
				containerRuntimeCtor = ContainerRuntimeWithAttributor as unknown as typeof ContainerRuntime,
			} = params;

			const runtimeAttributor = (
				containerScope as FluidObject<IProvideRuntimeAttributor> | undefined
			)?.IRuntimeAttributor;
			if (!runtimeAttributor) {
				throw new UsageError(
					"ContainerRuntimeWithAttributor must be passed a scope implementing IProvideRuntimeAttributor",
				);
			}

			const pendingRuntimeState = context.pendingLocalState as {
				baseSnapshot?: ISnapshotTree;
			};
			const baseSnapshot: ISnapshotTree | undefined =
				pendingRuntimeState?.baseSnapshot ?? context.baseSnapshot;

			const { quorum, deltaManager, taggedLogger } = context;
			assert(
				quorum !== undefined,
				0x968 /* quorum must exist when instantiating attribution-providing runtime */,
			);

			const mc = loggerToMonitoringContext(taggedLogger);

			const shouldTrackAttribution = mc.config.getBoolean(enableOnNewFileKey) ?? false;
			if (shouldTrackAttribution) {
				const { options } = context;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				(options.attribution ??= {}).track = true;
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const runtime = (await Base.loadRuntime({
				context,
				registryEntries,
				requestHandler,
				provideEntryPoint,
				// ! This prop is needed for back-compat. Can be removed in 2.0.0-internal.8.0.0
				initializeEntryPoint: provideEntryPoint,
				runtimeOptions,
				containerScope,
				existing,
				containerRuntimeCtor,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)) as ContainerRuntimeWithAttributor;
			runtime.runtimeAttributor = runtimeAttributor as RuntimeAttributor;

			const logger = createChildLogger({
				logger: runtime.baseLogger,
				namespace: "Attributor",
			});

			// Note: this fetches attribution blobs relatively eagerly in the load flow; we may want to optimize
			// this to avoid blocking on such information until application actually requests some op-based attribution
			// info or we need to summarize. All that really needs to happen immediately is to start recording
			// op seq# -> attributionInfo for new ops.
			await PerformanceEvent.timedExecAsync(
				logger,
				{
					eventName: "initialize",
				},
				async (event) => {
					await runtime.runtimeAttributor?.initialize(
						deltaManager,
						quorum,
						baseSnapshot,
						async (id) => runtime.storage.readBlob(id),
						shouldTrackAttribution,
					);
					event.end({
						attributionEnabledInConfig: shouldTrackAttribution,
						attributionEnabledInDoc: runtime.runtimeAttributor
							? runtime.runtimeAttributor.isEnabled
							: false,
					});
				},
			);

			return runtime;
		}

		private runtimeAttributor: RuntimeAttributor | undefined;

		protected addContainerStateToSummary(
			summaryTree: ISummaryTreeWithStats,
			fullTree: boolean,
			trackState: boolean,
			telemetryContext?: ITelemetryContext,
		): void {
			super.addContainerStateToSummary(summaryTree, fullTree, trackState, telemetryContext);
			const attributorSummary = this.runtimeAttributor?.summarize();
			if (attributorSummary) {
				addSummarizeResultToSummary(summaryTree, attributorTreeName, attributorSummary);
			}
		}
	} as unknown as typeof ContainerRuntime;

class RuntimeAttributor implements IRuntimeAttributor {
	public get IRuntimeAttributor(): IRuntimeAttributor {
		return this;
	}

	public get(key: AttributionKey): AttributionInfo {
		assert(
			this.opAttributor !== undefined,
			0x509 /* RuntimeAttributor must be initialized before getAttributionInfo can be called */,
		);

		if (key.type === "detached") {
			throw new Error("Attribution of detached keys is not yet supported.");
		}

		if (key.type === "local") {
			// Note: we can *almost* orchestrate this correctly with internal-only changes by looking up the current
			// client id in the audience. However, for read->write client transition, the container might have not yet
			// received a client id. This is left as a TODO as it might be more easily solved once the detached case
			// is settled (e.g. if it's reasonable for the host to know the current user information at container
			// creation time, we could just use that here as well).
			throw new Error("Attribution of local keys is not yet supported.");
		}

		return this.opAttributor.getAttributionInfo(key.seq);
	}

	public has(key: AttributionKey): boolean {
		if (key.type === "detached") {
			return false;
		}

		if (key.type === "local") {
			return false;
		}

		return this.opAttributor?.tryGetAttributionInfo(key.seq) !== undefined;
	}

	private encoder: Encoder<IAttributor, string> = {
		encode: unreachableCase,
		decode: unreachableCase,
	};

	private opAttributor: IAttributor | undefined;
	public isEnabled = false;

	public async initialize(
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		quorum: IQuorumClients,
		baseSnapshot: ISnapshotTree | undefined,
		readBlob: (id: string) => Promise<ArrayBufferLike>,
		shouldAddAttributorOnNewFile: boolean,
	): Promise<void> {
		const attributorTree = baseSnapshot?.trees[attributorTreeName];
		// Existing documents that don't already have a snapshot containing runtime attribution info shouldn't
		// inject any for now--this causes some back-compat integration problems that aren't fully worked out.
		const shouldExcludeAttributor =
			(baseSnapshot !== undefined && attributorTree === undefined) ||
			(baseSnapshot === undefined && !shouldAddAttributorOnNewFile);
		if (shouldExcludeAttributor) {
			// This gives a consistent error for calls to `get` on keys that don't exist.
			this.opAttributor = new Attributor();
			return;
		}

		this.isEnabled = true;
		this.encoder = chain(
			new AttributorSerializer(
				(entries) => new OpStreamAttributor(deltaManager, quorum, entries),
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);

		if (attributorTree === undefined) {
			this.opAttributor = new OpStreamAttributor(deltaManager, quorum);
		} else {
			const id = attributorTree.blobs[opBlobName];
			assert(
				id !== undefined,
				0x50a /* Attributor tree should have op attributor summary blob. */,
			);
			const blobContents = await readBlob(id);
			const attributorSnapshot = bufferToString(blobContents, "utf8");
			this.opAttributor = this.encoder.decode(attributorSnapshot);
		}
	}

	public summarize(): ISummaryTreeWithStats | undefined {
		if (!this.isEnabled) {
			// Loaded existing document without attributor data: avoid injecting any data.
			return undefined;
		}

		assert(
			this.opAttributor !== undefined,
			0x50b /* RuntimeAttributor should be initialized before summarization */,
		);
		const builder = new SummaryTreeBuilder();
		builder.addBlob(opBlobName, this.encoder.encode(this.opAttributor));
		return builder.getSummaryTree();
	}
}
