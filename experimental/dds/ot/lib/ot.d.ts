/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidSerializer } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage, ITree } from "@fluidframework/protocol-definitions";
import { IChannelAttributes, IFluidDataStoreRuntime, IChannelStorageService, IChannelFactory, Serializable } from "@fluidframework/datastore-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
import { Doc, JSONOp } from "ot-json1";
import { ISharedOT } from "./interfaces";
export declare class SharedOT extends SharedObject implements ISharedOT {
    private readonly pendingOps;
    /**
     * Create a new shared OT
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    static create(runtime: IFluidDataStoreRuntime, id?: string): SharedOT;
    /**
     * Get a factory for SharedOT to register with the data store.
     *
     * @returns a factory that creates and load SharedOT
     */
    static getFactory(): IChannelFactory;
    private root;
    /**
     * Constructs a new shared OT. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes);
    get(): Doc;
    insert(path: (string | number)[], value: Serializable): void;
    move(from: (string | number)[], to: (string | number)[]): void;
    remove(path: (string | number)[], value?: boolean): void;
    replace(path: (string | number)[], oldValue: Serializable, newValue: Serializable): void;
    apply(op: JSONOp): void;
    protected snapshotCore(serializer: IFluidSerializer): ITree;
    protected loadCore(storage: IChannelStorageService): Promise<void>;
    protected initializeLocalCore(): void;
    protected registerCore(): void;
    protected onDisconnect(): void;
    protected processCore(message: ISequencedDocumentMessage, local: boolean): void;
    protected applyStashedOp(): void;
}
//# sourceMappingURL=ot.d.ts.map