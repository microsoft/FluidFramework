/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert , bufferToString } from "@fluidframework/common-utils";
import { IFluidSerializer, ISerializedHandle } from "@fluidframework/core-interfaces";

import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
    Serializable,
} from "@fluidframework/datastore-definitions";
import { SharedObject, ValueType } from "@fluidframework/shared-object-base";
import { moveOp, Doc, type, insertOp, JSONOp, removeOp, replaceOp } from "ot-json1";
import { OTFactory } from "./factory";
import { debug } from "./debug";
import { ISharedOT, ISharedOTEvents } from "./interfaces";

export class SharedOT<T extends Serializable = any>
    extends SharedObject<ISharedOTEvents<T>>
    implements ISharedOT<T>
{
    private readonly pendingOps: JSONOp[] = [];

    /**
     * Create a new shared OT
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, OTFactory.Type) as SharedOT;
    }

    /**
     * Get a factory for SharedOT to register with the data store.
     *
     * @returns a factory that creates and load SharedOT
     */
    public static getFactory(): IChannelFactory {
        return new OTFactory();
    }

    private root: Serializable = {};

    /**
     * Constructs a new shared OT. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    public get() { return this.root; }

    public insert(path: (string | number)[], value: Serializable) {
        this.applyOtOp(insertOp(path, value as Doc));
    }

    public move(from: (string | number)[], to: (string | number)[]) {
        this.applyOtOp(moveOp(from, to));
    }

    public remove(path: (string | number)[], value?: boolean) {
        this.applyOtOp(removeOp(path, value));
    }

    public replace(path: (string | number)[], oldValue: Serializable, newValue: Serializable) {
        this.applyOtOp(replaceOp(path, oldValue as Doc, newValue as Doc));
    }

    private applyOtOp(op: JSONOp) {
        this.root = type.apply(this.root as Doc, op);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        this.pendingOps.push(op);
        this.submitLocalMessage(op);
    }

    protected snapshotCore(serializer: IFluidSerializer): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: "header",
                    type: TreeEntry.Blob,
                    value: {
                        contents: serializer.stringify(this.root, this.handle),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        return tree;
    }

    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const blob = await storage.readBlob("header");
        const rawContent = bufferToString(blob, "utf8");
        this.root = this.runtime.IFluidSerializer.parse(rawContent);
    }

    protected initializeLocalCore() {
        this.root = {};
    }

    protected registerCore() {}

    protected onDisconnect() {
        debug(`OT ${this.id} is now disconnected`);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (local) {
            this.pendingOps.shift();
            return;
        }

        let remoteOp = message.contents;

        for (const localPendingOp of this.pendingOps) {
            remoteOp = type.transformNoConflict(localPendingOp, remoteOp, "right");
        }


    }
}
