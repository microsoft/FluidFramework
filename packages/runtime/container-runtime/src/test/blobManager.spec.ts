/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { Deferred, gitHashFile, IsoBuffer, TelemetryNullLogger, TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions";
import { ISequencedDocumentMessage, SummaryType } from "@fluidframework/protocol-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { BlobManager, IBlobManagerLoadInfo, IBlobManagerRuntime } from "../blobManager";

abstract class BaseMockBlobStorage implements Pick<IDocumentStorageService, "readBlob" | "createBlob"> {
    public blobs: Map<string, ArrayBufferLike> = new Map();
    public abstract createBlob(blob: ArrayBufferLike);
    public async readBlob(id: string) {
        const blob = this.blobs.get(id);
        assert(!!blob);
        return blob;
    }
}

class DedupeStorage extends BaseMockBlobStorage {
    public async createBlob(blob: ArrayBufferLike) {
        const id = await gitHashFile(blob as any);
        this.blobs.set(id, blob);
        return { id };
    }
}

class NonDedupeStorage extends BaseMockBlobStorage {
    public async createBlob(blob: ArrayBufferLike) {
        const id = this.blobs.size.toString();
        this.blobs.set(id, blob);
        return { id };
    }
}

class MockRuntime extends TypedEventEmitter<IContainerRuntimeEvents> implements IBlobManagerRuntime {
    constructor(snapshot: IBlobManagerLoadInfo = {}, attached = false) {
        super();
        this.attachState = attached ? AttachState.Attached : AttachState.Detached;
        this.blobManager = new BlobManager(
            undefined as any, // routeContext
            snapshot,
            () => this.getStorage(),
            (blobId, localId) => this.sendBlobAttachOp(blobId, localId),
            () => undefined,
            this,
        );
    }

    public get storage() {
        return (this.attachState === AttachState.Detached ?
            this.detachedStorage : this.attachedStorage) as unknown as IDocumentStorageService;
    }

    public getStorage() {
        return {
            createBlob: async (blob) => {
                const P = this.processBlobsP.promise.then(async () => this.storage.createBlob(blob));
                this.blobPs.push(P);
                return P;
            },
            readBlob: async (id) => this.storage.readBlob(id),
        } as unknown as IDocumentStorageService;
    }

    public sendBlobAttachOp(blobId?: string, localId?: string) {
        this.ops.push({ metadata: { blobId, localId } });
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        const P = this.blobManager.createBlob(blob);
        this.handlePs.push(P);
        return P;
    }

    public blobManager: BlobManager;
    public connected = false;
    public attachState: AttachState;
    public attachedStorage = new DedupeStorage();
    public detachedStorage = new NonDedupeStorage();
    public logger = new TelemetryNullLogger();

    private ops: any[] = [];
    private processBlobsP = new Deferred<void>();
    private blobPs: Promise<any>[] = [];
    private handlePs: Promise<any>[] = [];

    public processOps() {
        assert(this.connected || this.ops.length === 0);
        this.ops.forEach((op) => this.blobManager.processBlobAttachOp(op, true));
        this.ops = [];
    }

    public async processBlobs(connecting = false) {
        assert(connecting || this.connected || this.attachState === AttachState.Detached);
        const blobPs = this.blobPs;
        this.blobPs = [];
        this.processBlobsP.resolve();
        this.processBlobsP = new Deferred<void>();
        await Promise.all(blobPs);
    }

    public async processHandles() {
        const handlePs = this.handlePs;
        this.handlePs = [];
        await Promise.all(handlePs);
    }

   public async processAll() {
        while (this.blobPs.length + this.handlePs.length + this.ops.length > 0) {
            const p1 = this.processBlobs();
            const p2 = this.processHandles();
            this.processOps();
            await Promise.race([p1, p2]);
            await new Promise<void>((r) => setTimeout(r, 0));
            this.processOps();
            await Promise.all([p1, p2]);
        }
   }

    public async attach() {
        if (this.detachedStorage.blobs.size > 0) {
            const table = new Map();
            for (const [detachedId, blob] of this.detachedStorage.blobs) {
                const { id } = await this.attachedStorage.createBlob(blob);
                table.set(detachedId, id);
            }
            this.detachedStorage.blobs.clear();
            this.blobManager.setRedirectTable(table);
        }
        const summary = validateSummary(this);
        this.attachState = AttachState.Attached;
        this.emit("attached");
        return summary;
    }

    public async connect() {
        assert(!this.connected);
        if (this.blobManager.hasPendingUploads) {
            const uploadP = this.blobManager.onConnected();
            await this.processBlobs(true);
            await uploadP;
        }
        this.connected = true;
        this.emit("connected", "client ID");
        const ops = this.ops;
        this.ops = [];
        ops.forEach((op) => this.blobManager.reSubmit(op.metadata));
    }

    public disconnect() {
        assert(this.connected);
        this.blobPs = [];
        this.connected = false;
        this.emit("disconnected");
    }

    public async remoteUpload(blob: ArrayBufferLike, redirected = false) {
        const response = await this.storage.createBlob(blob);
        const op = { metadata: { blobId: response.id, localId: redirected ? uuid() : undefined } };
        this.blobManager.processBlobAttachOp(op as ISequencedDocumentMessage, false);
        return op;
    }
}

const validateSummary = (runtime: MockRuntime) => {
    const summary = runtime.blobManager.summarize();
    const ids: any[] = [];
    let redirectTable;
    for (const [key, attachment] of Object.entries(summary.summary.tree)) {
        if (attachment.type === SummaryType.Attachment) {
            ids.push(attachment.id);
        } else {
            assert.strictEqual(key, (BlobManager as any).redirectTableBlobName);
            assert(attachment.type === SummaryType.Blob);
            assert(typeof attachment.content === "string");
            redirectTable = new Map(JSON.parse(attachment.content));
        }
    }
    return { ids, redirectTable };
};

describe("BlobManager", () => {
    const handlePs: Promise<any>[] = [];
    let runtime: MockRuntime;
    let createBlob: (blob) => any;

    beforeEach(() => {
        runtime = new MockRuntime();
        handlePs.length = 0;
        createBlob = (blob: ArrayBufferLike) => handlePs.push(runtime.createBlob(blob));
    });

    afterEach(async () => {
        await Promise.all(handlePs);
    });

    it("empty snapshot", () => {
        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 0);
        assert.strictEqual(summaryData.redirectTable, undefined);
    });

    it("non empty snapshot", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable, undefined);
    });

    it("detached snapshot", async () => {
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable, undefined);
    });

    it("detached->attached snapshot", async () => {
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();
        await runtime.attach();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 1);
    });

    it("uploads while disconnected", async () => {
        await runtime.attach();

        await runtime.createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.connect();
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 1);
    });

    it("transition to offline while upload pending", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));

        runtime.disconnect();
        await runtime.connect();
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 1);
    });

    it("transition to offline while op in flight", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processBlobs();

        runtime.disconnect();
        await runtime.connect();
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 2);
    });

    it("multiple disconnect/connects", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        runtime.disconnect();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob2", "utf8"));
        await runtime.processBlobs();

        runtime.disconnect();
        await runtime.connect();
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 2);
        assert.strictEqual(summaryData.redirectTable.size, 2);
    });

    it("handles deduped IDs", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        runtime.disconnect();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processBlobs();

        runtime.disconnect();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 4);
    });

    it("handles deduped IDs in detached", async () => {
        runtime.detachedStorage = new DedupeStorage();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable, undefined);
    });

    it("handles deduped IDs in detached->attached", async () => {
        runtime.detachedStorage = new DedupeStorage();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        await runtime.attach();
        await runtime.connect();
        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));

        runtime.disconnect();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processBlobs();

        runtime.disconnect();
        await runtime.connect();
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 4);
    });

    it("can load from summary", async () => {
        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        await runtime.attach();
        createBlob(IsoBuffer.from("blob", "utf8"));

        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 2);

        const runtime2 = new MockRuntime(summaryData, true);
        const summaryData2 = validateSummary(runtime2);
        assert.strictEqual(summaryData2.ids.length, 1);
        assert.strictEqual(summaryData2.redirectTable.size, 2);
    });

    it("handles duplicate remote upload", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.remoteUpload(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable, undefined);
    });

    it("handles duplicate remote upload between upload and op", async () => {
        await runtime.attach();
        await runtime.connect();

        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.processBlobs();
        await runtime.remoteUpload(IsoBuffer.from("blob", "utf8"));
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable, undefined);
    });

    it("handles duplicate remote upload with local ID", async () => {
        await runtime.attach();

        createBlob(IsoBuffer.from("blob", "utf8"));
        await runtime.connect();
        await runtime.remoteUpload(IsoBuffer.from("blob", "utf8"), true);
        await runtime.processAll();

        const summaryData = validateSummary(runtime);
        assert.strictEqual(summaryData.ids.length, 1);
        assert.strictEqual(summaryData.redirectTable.size, 2);
    });

    it("includes blob IDs in summary while attaching", async () => {
        createBlob(IsoBuffer.from("blob1", "utf8"));
        createBlob(IsoBuffer.from("blob2", "utf8"));
        createBlob(IsoBuffer.from("blob3", "utf8"));
        await runtime.processAll();

        // While attaching with blobs, Container takes a summary while still in "Detached"
        // state. BlobManager should know to include the list of attached blob
        // IDs since this summary will be used to create the document
        const summaryData = await runtime.attach();
        assert.strictEqual(summaryData?.ids.length, 3);
        assert.strictEqual(summaryData?.redirectTable.size, 3);
    });
});
