/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { bufferToString } from "@fluidframework/common-utils";
import { FileMode, TreeEntry, } from "@fluidframework/protocol-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
import { type, replaceOp, insertOp, moveOp, removeOp } from "ot-json1";
import { OTFactory } from "./factory";
import { debug } from "./debug";
export class SharedOT extends SharedObject {
    /**
     * Constructs a new shared OT. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id, runtime, attributes) {
        super(id, runtime, attributes);
        this.pendingOps = [];
        // eslint-disable-next-line no-null/no-null
        this.root = null;
    }
    /**
     * Create a new shared OT
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    static create(runtime, id) {
        return runtime.createChannel(id, OTFactory.Type);
    }
    /**
     * Get a factory for SharedOT to register with the data store.
     *
     * @returns a factory that creates and load SharedOT
     */
    static getFactory() {
        return new OTFactory();
    }
    get() { return this.root; }
    insert(path, value) {
        this.apply(insertOp(path, value));
    }
    move(from, to) {
        this.apply(moveOp(from, to));
    }
    remove(path, value) {
        this.apply(removeOp(path, value));
    }
    replace(path, oldValue, newValue) {
        this.apply(replaceOp(path, oldValue, newValue));
    }
    apply(op) {
        this.root = type.apply(this.root, op);
        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }
        this.pendingOps.push(op);
        this.submitLocalMessage(op);
    }
    snapshotCore(serializer) {
        const tree = {
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
    async loadCore(storage) {
        const blob = await storage.readBlob("header");
        const rawContent = bufferToString(blob, "utf8");
        this.root = this.runtime.IFluidSerializer.parse(rawContent);
    }
    initializeLocalCore() {
        this.root = {};
    }
    registerCore() { }
    onDisconnect() {
        debug(`OT ${this.id} is now disconnected`);
    }
    processCore(message, local) {
        if (local) {
            this.pendingOps.shift();
        }
        else {
            let remoteOp = message.contents;
            for (const localPendingOp of this.pendingOps) {
                remoteOp = type.transformNoConflict(remoteOp, localPendingOp, "right");
            }
            this.root = type.apply(this.root, remoteOp);
        }
    }
    applyStashedOp() {
        throw new Error("not implemented");
    }
}
//# sourceMappingURL=ot.js.map