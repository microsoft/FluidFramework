/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluidframework/common-utils";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import {
    createSingleBlobSummary,
    IFluidSerializer,
    SharedObject,
} from "@fluidframework/shared-object-base";
import {
    Interval,
    IntervalCollection,
    IntervalCollectionValueType,
    ISerializableInterval,
} from "./intervalCollection";
import { MapKernel } from "./mapKernel";
import { pkgVersion } from "./packageVersion";

const snapshotFileName = "header";

/**
 * The factory that defines the SharedIntervalCollection
 */
export class SharedIntervalCollectionFactory implements IChannelFactory {
    public static readonly Type = "https://graph.microsoft.com/types/sharedIntervalCollection";

    public static readonly Attributes: IChannelAttributes = {
        type: SharedIntervalCollectionFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedIntervalCollectionFactory.Type;
    }

    public get attributes() {
        return SharedIntervalCollectionFactory.Attributes;
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes): Promise<SharedIntervalCollection> {
        const map = new SharedIntervalCollection(id, runtime, attributes);
        await map.load(services);

        return map;
    }

    public create(runtime: IFluidDataStoreRuntime, id: string): SharedIntervalCollection {
        const map = new SharedIntervalCollection(
            id,
            runtime,
            this.attributes);
        map.initializeLocal();

        return map;
    }
}

export interface ISharedIntervalCollection<TInterval extends ISerializableInterval> {
    waitIntervalCollection(label: string): Promise<IntervalCollection<TInterval>>;
    getIntervalCollection(label: string): IntervalCollection<TInterval>;
}

export class SharedIntervalCollection<TInterval extends ISerializableInterval = Interval>
    extends SharedObject implements ISharedIntervalCollection<TInterval> {
    /**
     * Create a SharedIntervalCollection
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedIntervalCollectionFactory.Type) as SharedIntervalCollection;
    }

    /**
     * Get a factory for SharedIntervalCollection to register with the data store.
     *
     * @returns a factory that creates and load SharedIntervalCollection
     */
    public static getFactory(): IChannelFactory {
        return new SharedIntervalCollectionFactory();
    }

    public readonly [Symbol.toStringTag]: string = "SharedIntervalCollection";
    private readonly intervalMapKernel: MapKernel;

    /**
     * Constructs a new shared SharedIntervalCollection. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes);
        this.intervalMapKernel = new MapKernel(
            this.serializer,
            this.handle,
            (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
            () => this.isAttached(),
            [new IntervalCollectionValueType()],
        );
    }

    public async waitIntervalCollection(
        label: string,
    ): Promise<IntervalCollection<TInterval>> {
        return this.intervalMapKernel.wait<IntervalCollection<TInterval>>(
            this.getIntervalCollectionPath(label));
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getIntervalCollection(label: string): IntervalCollection<TInterval> {
        const realLabel = this.getIntervalCollectionPath(label);
        if (!this.intervalMapKernel.has(realLabel)) {
            this.intervalMapKernel.createValueType(
                label,
                IntervalCollectionValueType.Name,
                undefined);
        }

        const sharedCollection =
            this.intervalMapKernel.get<IntervalCollection<TInterval>>(realLabel);
        return sharedCollection;
    }

    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        return createSingleBlobSummary(snapshotFileName, this.intervalMapKernel.serialize(serializer));
    }

    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        this.intervalMapKernel.trySubmitMessage(content, localOpMetadata);
    }

    protected onDisconnect() { }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService) {
        const blob = await storage.readBlob(snapshotFileName);
        const header = bufferToString(blob,"utf8");
        this.intervalMapKernel.populate(header);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            this.intervalMapKernel.tryProcessMessage(message.contents, local, message, localOpMetadata);
        }
    }

    /**
     * Creates the full path of the intervalCollection label
     * @param label - the incoming label
     */
    protected getIntervalCollectionPath(label: string): string {
        return label;
    }

    protected applyStashedOp() {
        throw new Error("not implemented");
    }
}
