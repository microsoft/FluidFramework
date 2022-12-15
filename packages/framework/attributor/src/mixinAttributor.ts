/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentMessage, ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IAudience, IContainerContext, IDeltaManager } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { ISummaryTreeWithStats, ITelemetryContext, NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { addSummarizeResultToSummary, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest, IResponse, FluidObject } from "@fluidframework/core-interfaces";
import { assert, bufferToString, unreachableCase } from "@fluidframework/common-utils";
import { AttributionInfo, AttributionKey, IAttributor, OpStreamAttributor } from "./attributor";
import { AttributorSerializer, chain, deltaEncoder, Encoder } from "./encoders";
import { makeLZ4Encoder } from "./lz4Encoder";

// Summary tree keys
const attributorKey = "attributor";
const opKey = "op";

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
 * @alpha
 */
export interface IRuntimeAttributor extends IProvideRuntimeAttributor {
    getAttributionInfo(key: AttributionKey): AttributionInfo;
}

/**
 * Mixin class that adds runtime-based attribution functionality.
 * @param Base - base class, inherits from FluidAttributorRuntime
 * @alpha
 */
export const mixinAttributor = (
    Base: typeof ContainerRuntime = ContainerRuntime,
) => class ContainerRuntimeWithAttributor extends Base {
        public static async load(
            context: IContainerContext,
            registryEntries: NamedFluidDataStoreRegistryEntries,
            requestHandler?: ((request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>) | undefined,
            runtimeOptions: IContainerRuntimeOptions | undefined = {},
            containerScope: FluidObject | undefined = context.scope,
            existing?: boolean | undefined,
            ctor: typeof ContainerRuntime = ContainerRuntimeWithAttributor as unknown as typeof ContainerRuntime
        ): Promise<ContainerRuntime> {
            const pendingRuntimeState = context.pendingLocalState as { baseSnapshot?: ISnapshotTree };
            const baseSnapshot: ISnapshotTree | undefined = pendingRuntimeState?.baseSnapshot ?? context.baseSnapshot;
            const attributorSnapshot = baseSnapshot?.trees[attributorKey];

            const { audience, deltaManager } = context;
            assert(audience !== undefined, "Audience must exist when instantiating attribution-providing runtime");

            // Existing documents that don't already have a snapshot containing runtime attribution info shouldn't
            // inject any for now--this causes some back-compat integration problems that aren't fully worked out.
            const shouldExcludeAttributor = baseSnapshot !== undefined && attributorSnapshot === undefined;

            const runtimeAttributor = shouldExcludeAttributor ? undefined : new RuntimeAttributor();
            const scope = { ...containerScope, IRuntimeAttributor: runtimeAttributor };
            const runtime = await Base.load(
                context,
                registryEntries,
                requestHandler,
                runtimeOptions,
                scope,
                existing,
                ctor
            ) as ContainerRuntimeWithAttributor;
            runtime.runtimeAttributor = runtimeAttributor;

            // Note: this fetches attribution blobs relatively eagerly in the load flow; we may want to optimize
            // this to avoid blocking on such information until application actually requests some op-based attribution
            // info or we need to summarize. All that really needs to happen immediately is to start recording
            // op seq# -> attributionInfo for new ops.
            await runtimeAttributor?.initialize(
                deltaManager,
                audience,
                attributorSnapshot,
                async (id) => runtime.storage.readBlob(id)
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
            if (this.runtimeAttributor) {
                addSummarizeResultToSummary(summaryTree, attributorKey, this.runtimeAttributor.summarize());
            }
        }
    } as unknown as typeof ContainerRuntime;

class RuntimeAttributor implements IRuntimeAttributor {
    public get IRuntimeAttributor(): IRuntimeAttributor { return this; };

    public getAttributionInfo(key: AttributionKey): AttributionInfo {
        assert(this.opAttributor !== undefined,
            "RuntimeAttributor must be initialized before getAttributionInfo can be called");
        
        return this.opAttributor.getAttributionInfo(key.seq);
    }
    
    private encoder: Encoder<IAttributor, string> = {
        encode: unreachableCase,
        decode: unreachableCase
    };


    private opAttributor: IAttributor | undefined;

    /**
     * Must be called before `getAttributionInfo` can return valid results.
     * @remarks - This class uses a construct-then-initialize pattern rather than an async static initializer because:
     * 1. It needs to be constructed in order to be placed on the container runtime's scope
     * 2. It can only read blobs from the snapshot once the container runtime has been initialized (in order to access
     * its `storage`, since the offline storage layer isn't possible to construct outside of the container-runtime
     * package)
     * 
     * If either of those problems have alternate solutions, converting this to a static async initializer and hiding
     * the constructor would likely be a better choice.
     */
    public async initialize(
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        audience: IAudience,
        snapshot: ISnapshotTree | undefined,
        readBlob: (id: string) => Promise<ArrayBufferLike>,
    ): Promise<void> {
        this.encoder = chain(
            new AttributorSerializer(
                (entries) => new OpStreamAttributor(deltaManager, audience, entries),
                deltaEncoder
            ),
            makeLZ4Encoder(),
        );

        if (snapshot !== undefined) {
            const opAttributorTree = snapshot.trees[opKey];
            assert(opAttributorTree !== undefined,
                "RuntimeAttributor snapshot should contain op-based attribution tree");
            
            const blobContents = await readBlob(opAttributorTree.blobs[attributorKey]);
            const attributorSnapshot = bufferToString(blobContents, "utf8");
            this.opAttributor = this.encoder.decode(attributorSnapshot);
        } else {
            this.opAttributor = new OpStreamAttributor(deltaManager, audience);
        }
    }

    public summarize() {
        // Note: we're leaving room in the summary format for additional attributors that this class keeps track of.
        // This is a potential solution to some extensibility asks.
        assert(this.opAttributor !== undefined, "RuntimeAttributor should be initialized before summarization");
        const builder = new SummaryTreeBuilder();
        builder.addWithStats(opKey, this.summarizeAttributor(this.opAttributor));
        return builder.getSummaryTree();
    }

    private summarizeAttributor(attributor: IAttributor) {
        const builder = new SummaryTreeBuilder();
        builder.addBlob(attributorKey, this.encoder.encode(attributor));
        return builder.getSummaryTree();
    }
}