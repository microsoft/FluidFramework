/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import { IAudience, IContainerContext, IDeltaManager } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	AttributionInfo,
	AttributionKey,
	ISummaryTreeWithStats,
	ITelemetryContext,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { addSummarizeResultToSummary, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest, IResponse, FluidObject } from "@fluidframework/core-interfaces";
import { assert, bufferToString, unreachableCase } from "@fluidframework/common-utils";
import {
	createChildLogger,
	loggerToMonitoringContext,
	PerformanceEvent,
	UsageError,
} from "@fluidframework/telemetry-utils";
import { Attributor, IAttributor, OpStreamAttributor } from "./attributor";
import { AttributorSerializer, chain, deltaEncoder, Encoder } from "./encoders";
import { makeLZ4Encoder } from "./lz4Encoder";

// Summary tree keys
const attributorTreeName = ".attributor";
const opBlobName = "op";

/**
 * @alpha
 * Feature Gate Key -
 * Whether or not a container runtime instantiated using `mixinAttributor`'s load should generate an attributor on
 * new files. See package README for more notes on integration.
 */
export const enableOnNewFileKey = "Fluid.Attribution.EnableOnNewFile";

/**
 * @alpha
 */
export const IRuntimeAttributor: keyof IProvideRuntimeAttributor = "IRuntimeAttributor";

/**
 * @alpha
 */
export interface IProvideRuntimeAttributor {
	readonly IRuntimeAttributor: IRuntimeAttributor;
}

/**
 * Provides access to attribution information stored on the container runtime.
 *
 * Attributors are only populated after the container runtime they are injected into has initialized.
 * @sealed
 * @alpha
 */
export interface IRuntimeAttributor extends IProvideRuntimeAttributor {
	/**
	 * @throws - If no AttributionInfo exists for this key.
	 */
	get(key: AttributionKey): AttributionInfo;

	/**
	 * @returns - Whether any AttributionInfo exists for the provided key.
	 */
	has(key: AttributionKey): boolean;

	/**
	 * @returns - Whether the runtime is currently tracking attribution information for the loaded container.
	 * See {@link mixinAttributor} for more details on when this happens.
	 */
	readonly isEnabled: boolean;
}

/**
 * @returns an IRuntimeAttributor for usage with `mixinAttributor`. The attributor will only be populated with data
 * once it's passed via scope to a container runtime load flow. See {@link mixinAttributor}.
 * @alpha
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
 * @alpha
 */
export const mixinAttributor = (Base: typeof ContainerRuntime = ContainerRuntime) =>
	class ContainerRuntimeWithAttributor extends Base {
		public static async load(
			context: IContainerContext,
			registryEntries: NamedFluidDataStoreRegistryEntries,
			requestHandler?:
				| ((request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>)
				| undefined,
			runtimeOptions: IContainerRuntimeOptions | undefined = {},
			containerScope: FluidObject | undefined = context.scope,
			existing?: boolean | undefined,
			ctor: typeof ContainerRuntime = ContainerRuntimeWithAttributor as unknown as typeof ContainerRuntime,
		): Promise<ContainerRuntime> {
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

			const { audience, deltaManager } = context;
			assert(
				audience !== undefined,
				0x508 /* Audience must exist when instantiating attribution-providing runtime */,
			);

			const mc = loggerToMonitoringContext(context.taggedLogger);

			const shouldTrackAttribution = mc.config.getBoolean(enableOnNewFileKey) ?? false;
			if (shouldTrackAttribution) {
				(context.options.attribution ??= {}).track = true;
			}

			const runtime = (await Base.load(
				context,
				registryEntries,
				requestHandler,
				runtimeOptions,
				containerScope,
				existing,
				ctor,
			)) as ContainerRuntimeWithAttributor;
			runtime.runtimeAttributor = runtimeAttributor as RuntimeAttributor;

			const logger = createChildLogger({ logger: runtime.logger, namespace: "Attributor" });

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
						audience,
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
		) {
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
		audience: IAudience,
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
				(entries) => new OpStreamAttributor(deltaManager, audience, entries),
				deltaEncoder,
			),
			makeLZ4Encoder(),
		);

		if (attributorTree !== undefined) {
			const id = attributorTree.blobs[opBlobName];
			assert(
				id !== undefined,
				0x50a /* Attributor tree should have op attributor summary blob. */,
			);
			const blobContents = await readBlob(id);
			const attributorSnapshot = bufferToString(blobContents, "utf8");
			this.opAttributor = this.encoder.decode(attributorSnapshot);
		} else {
			this.opAttributor = new OpStreamAttributor(deltaManager, audience);
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
