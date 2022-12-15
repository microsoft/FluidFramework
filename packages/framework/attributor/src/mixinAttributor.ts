/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { ISummaryTreeWithStats, ITelemetryContext, NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { addSummarizeResultToSummary, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest, IResponse, FluidObject } from "@fluidframework/core-interfaces";
import { assert, bufferToString, unreachableCase } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { AttributionInfo, AttributionKey, IAttributor, OpStreamAttributor } from "./attributor";
import { AttributorSerializer, chain, deltaEncoder, Encoder } from "./encoders";
import { makeLZ4Encoder } from "./lz4Encoder";

// The key for the attributor tree in summary.
// Note this is currently used for the overlal attribution path as well as each attributor's blob name.
const attributorKey = "attributor";

/**
 * @alpha
 */
export const IRuntimeAttribution: keyof IProvideRuntimeAttribution = "IRuntimeAttribution";

/**
 * @alpha
 */
export interface IProvideRuntimeAttribution {
    readonly IRuntimeAttribution: IRuntimeAttribution;
}

/**
 * Provides access to attribution information stored on the container runtime.
 * @alpha
 */
export interface IRuntimeAttribution extends IProvideRuntimeAttribution {
    getAttributionInfo(key: AttributionKey): AttributionInfo;
}

/**
 * Mixin class that adds runtime-based attribution functionality.
 * @param Base - base class, inherits from FluidAttributorRuntime
 * @alpha
 */
export const mixinAttributor = (
    Base: typeof ContainerRuntime = ContainerRuntime,
) => class ContainerRuntimeWithAttributor extends Base implements IRuntimeAttribution {
        public get IRuntimeAttribution(): IRuntimeAttribution { return this; }

        public static async load(
            context: IContainerContext,
            registryEntries: NamedFluidDataStoreRegistryEntries,
            requestHandler?: ((request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>) | undefined,
            runtimeOptions: IContainerRuntimeOptions | undefined = {},
            containerScope: FluidObject | undefined = context.scope,
            existing?: boolean | undefined,
            ctor: typeof ContainerRuntime = ContainerRuntimeWithAttributor as unknown as typeof ContainerRuntime
        ): Promise<ContainerRuntime> {
            const runtime = await Base.load(
                context,
                registryEntries,
                requestHandler,
                runtimeOptions,
                containerScope,
                existing,
                ctor
            ) as ContainerRuntimeWithAttributor;

            const pendingRuntimeState = context.pendingLocalState as { baseSnapshot?: ISnapshotTree };
            const baseSnapshot: ISnapshotTree | undefined = pendingRuntimeState?.baseSnapshot ?? context.baseSnapshot;
            const { audience, deltaManager } = context;
            assert(audience !== undefined, "Audience must exist when instantiating attribution-providing runtime");

            runtime.encoder = chain(
                new AttributorSerializer(
                    (entries) => new OpStreamAttributor(runtime.deltaManager, runtime.getAudience(), entries),
                    deltaEncoder
                ),
                makeLZ4Encoder(),
            );

            const snapshot = baseSnapshot?.trees[attributorKey];
            if (snapshot !== undefined) {
                await Promise.all(Object.entries(snapshot.trees).map(async ([key, value]) => {
                    const blobContents = await runtime.storage.readBlob(value.blobs[attributorKey])
                    const attributorSnapshot = bufferToString(blobContents, "utf8");
                    const attributor = runtime.encoder.decode(attributorSnapshot);
                    runtime.attributors.set(key, attributor);
                }));
            } else {
                // TODO: need configurable policy on how to instantiate these stores
                const attributor = new OpStreamAttributor(deltaManager, audience);
                runtime.attributors.set("op", attributor);
            }

            return runtime;
        }

        private encoder: Encoder<IAttributor, string> = {
            encode: unreachableCase,
            decode: unreachableCase
        };

        /**
         * Note: keys in this map will eventually correspond to names/ids of the injected attributors.
         * Currently there is no API on this mixin class which causes creation of any attributors besides OpStreamAttributor
         * (as it's the only thing created on new document creation, and snapshot load only grabs previously serialized
         * content).
         */
        private readonly attributors = new Map<string, IAttributor>();

        public getAttributionInfo(key: AttributionKey): AttributionInfo {
            const attributor = this.attributors.get(key.type);
            if (!attributor) {
                throw new UsageError(`Requested attribution information for non-existent attributor at ${key.type}`);
            }
            return attributor.getAttributionInfo(key.seq);
        }

        protected addContainerStateToSummary(
            summaryTree: ISummaryTreeWithStats,
            fullTree: boolean,
            trackState: boolean,
            telemetryContext?: ITelemetryContext,
        ) {
            super.addContainerStateToSummary(summaryTree, fullTree, trackState, telemetryContext);
            if (this.attributors.size > 0) {
                const builder = new SummaryTreeBuilder();
                for (const [attributorId, attributor] of this.attributors.entries()) {
                    builder.addWithStats(attributorId, this.summarizeAttributor(attributor));
                }
    
                addSummarizeResultToSummary(summaryTree, attributorKey, builder.getSummaryTree());
            }
        }

        private summarizeAttributor(attributor: IAttributor) {
            const builder = new SummaryTreeBuilder();
            builder.addBlob(attributorKey, this.encoder.encode(attributor));
            return builder.getSummaryTree();
        }
    } as unknown as typeof ContainerRuntime;