/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import {
    MapKernel,
} from "@microsoft/fluid-map";
import {
    FileMode, ISequencedDocumentMessage, ITree, MessageType, TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@microsoft/fluid-component-runtime-definitions";
import {
    ISharedObjectFactory, SharedObject,
} from "@microsoft/fluid-shared-object-base";
import { debug } from "./debug";
import {
    Interval,
    IntervalCollection,
    IntervalCollectionValueType,
    ISerializableInterval,
} from "./intervalCollection";
import { pkgVersion } from "./packageVersion";

const snapshotFileName = "header";

/**
 * The factory that defines the SharedIntervalCollection
 */
export class SharedIntervalCollectionFactory implements ISharedObjectFactory {
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

    public async load(
        runtime: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string,
        attributes: IChannelAttributes): Promise<SharedIntervalCollection> {
        const map = new SharedIntervalCollection(id, runtime, attributes);
        await map.load(branchId, services);

        return map;
    }

    public create(runtime: IComponentRuntime, id: string): SharedIntervalCollection {
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
     * @param runtime - component runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, SharedIntervalCollectionFactory.Type) as SharedIntervalCollection;
    }

    /**
     * Get a factory for SharedIntervalCollection to register with the component.
     *
     * @returns a factory that creates and load SharedIntervalCollection
     */
    public static getFactory(): ISharedObjectFactory {
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
        runtime: IComponentRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes);
        this.intervalMapKernel = new MapKernel(
            runtime,
            this.handle,
            (op) => this.submitLocalMessage(op),
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

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.intervalMapKernel.serialize(),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    protected onConnect(pending: any[]) {
        debug(`${this.id} is now connected`);
        for (const message of pending) {
            this.intervalMapKernel.trySubmitMessage(message);
        }
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {
        const header = await storage.read(snapshotFileName);

        const data: string = header ? fromBase64ToUtf8(header) : undefined;
        this.intervalMapKernel.populate(data);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation) {
            this.intervalMapKernel.tryProcessMessage(message, local);
        }
    }

    protected registerCore() {
        for (const value of this.intervalMapKernel.values()) {
            if (SharedObject.is(value)) {
                value.register();
            }
        }
    }

    /**
     * Creates the full path of the intervalCollection label
     * @param label - the incoming lable
     */
    protected getIntervalCollectionPath(label: string): string {
        return label;
    }
}
