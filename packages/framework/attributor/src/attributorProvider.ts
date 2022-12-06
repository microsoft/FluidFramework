/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IAudience, IContainerContext, IDeltaManager } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { AttributionInfo, AttributionKey, IAttributor } from "./attributor";
import { ISummaryTreeWithStats, ITelemetryContext, NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { addSummarizeResultToSummary, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { OpStreamAttributor } from "./attributor";
import { AttributorSerializer, chain, deltaEncoder, Encoder } from "./encoders";
import { makeLZ4Encoder } from "./lz4Encoder";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest, IResponse, FluidObject } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { assert, bufferToString, unreachableCase } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";

export interface IProvideAttributorProvider {
	IAttributorProvider: IAttributorProvider;
}

export interface IAttributorProvider extends IProvideAttributorProvider {
	initialize(
        storage: Pick<IDocumentStorageService, "readBlob">,
		deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
		audience: IAudience,
		summary?: ISnapshotTree
	): Promise<IAttributor & { summarize: () => ISummaryTreeWithStats; }>;
}

export interface IAttributorWithSummarization extends IAttributor {
    summarize: () => ISummaryTreeWithStats;
}

// The key for the attributor tree in summary.
// Note this is currently used for the overlal attribution path as well as each attributor's blob name.
const attributorKey = "attributor";

/**
 * Mixin class that adds await for DataObject to finish initialization before we proceed to summary.
 * @param registry - Registry of constructable attributor types. Keys in this registry correspond to
 * `IAttributor.type` fields.
 * @param Base - base class, inherits from FluidDataStoreRuntime
 */
export const mixinAttributor = (
    registry: Map<string, (entries: Iterable<[number, AttributionInfo]>) => IAttributor>,
    Base: typeof ContainerRuntime = ContainerRuntime,
) => class ContainerRuntimeWithAttributor extends Base {
        public static async load(
            context: IContainerContext,
            registryEntries: NamedFluidDataStoreRegistryEntries,
            requestHandler?: ((request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>) | undefined,
            runtimeOptions: IContainerRuntimeOptions | undefined = {},
            containerScope: FluidObject<unknown> | undefined = context.scope,
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
                    registry,
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
                    // TODO: Need to distinguish between registry type (what is actually being referenced here currently)
                    // and some sort of runtime id/name for attributor (which is what should be used here)
                    runtime.attributors.set(key, attributor);
                }));
            } else {
                // TODO: need configurable policy on how to instantiate these stores
                const attributor = new OpStreamAttributor(deltaManager, audience);
                runtime.attributors.set(attributor.type, attributor);
            }

            return runtime;
        }

        private encoder: Encoder<IAttributor, string> = {
            encode: unreachableCase,
            decode: unreachableCase
        };

        private attributors = new Map<string, IAttributor>();

        public getAttributionInfo(key: AttributionKey): AttributionInfo {
            const attributor = this.attributors.get(key.type);
            if (!attributor) {
                throw new UsageError(`Requested attribution information for non-existent attributor at ${key.type}`);
            }
            return attributor.getAttributionInfo(key.key);
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
                for (const [type, attributor] of this.attributors.entries()) {
                    builder.addWithStats(type, this.summarizeAttributor(attributor));
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