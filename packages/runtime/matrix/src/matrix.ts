/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ChildLogger } from "@microsoft/fluid-core-utils";
import * as MergeTree from "@microsoft/fluid-merge-tree";
import { Client } from "@microsoft/fluid-merge-tree";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    Jsonable,
    JsonablePrimitive,
} from "@microsoft/fluid-runtime-definitions";
import { RunSegment, SharedNumberSequenceFactory } from "@microsoft/fluid-sequence";
import { parseHandles, serializeHandles, SharedObject } from "@microsoft/fluid-shared-object-base";
import { strict as assert } from "assert";
import { SharedMatrixFactory } from ".";
import { debug } from "./debug";
import { HandleTable } from "./handletable";
import { pointToKey } from "./keys";
import { IMatrixCellMsg, MatrixOp } from "./ops";

const unallocated = -1 as const;

const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
}

class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService, private readonly path: SnapshotPath) { }

    public read(path: string): Promise<string> {
        return this.storage.read(`${this.path}/${path}`);
    }
}

export class SharedMatrix<T extends Jsonable<JsonablePrimitive | IComponentHandle>> extends SharedObject {

    public get numRows() { return this.rows.getLength(); }
    public get numCols() { return this.cols.getLength(); }
    public static getFactory() { return new SharedMatrixFactory(); }

    private readonly rows: MergeTree.Client;
    private readonly rowTable = new HandleTable<number>();

    private readonly cols: MergeTree.Client;
    private readonly colTable = new HandleTable<number>();

    private readonly cellKeyToValue = new Map<number, T>();
    private readonly cellKeyToCliSeq = new Map<number, number>();

    constructor(
        runtime: IComponentRuntime,
        public id: string,
    ) {
        super(id, runtime, SharedMatrixFactory.Attributes);

        this.rows = new MergeTree.Client(
            SharedNumberSequenceFactory.segmentFromSpec,
            ChildLogger.create(this.logger, "Matrix.Rows.MergeTreeClient"),
            { ...runtime.options, newMergeTreeSnapshotFormat: true });
        this.cols = new MergeTree.Client(
            SharedNumberSequenceFactory.segmentFromSpec,
            ChildLogger.create(this.logger, "Matrix.Cols.MergeTreeClient"),
            { ...runtime.options, newMergeTreeSnapshotFormat: true });
    }

    public getCell(row: number, col: number) {
        // tslint:disable-next-line:no-parameter-reassignment
        ([row, col] = this.swizzle(row, col, /* alloc: */ false));
        if (row === unallocated || col === unallocated) {
            return undefined;
        }

        return this.cellKeyToValue.get(pointToKey(row, col));
    }

    public setCell(row: number, col: number, value: T) {
        const key = this.storeCell(row, col, value);
        this.submitCellMessage(key, {
            type: MatrixOp.setRange,
            row,
            col,
            value,
        });
    }

    public insertCols(start: number, count: number) {
        const op = this.cols.insertSegmentLocal(start, new RunSegment(new Array(count).fill(unallocated)));
        (op as any).target = "cols";
        this.submitLocalMessage(op);
    }

    public insertRows(start: number, count: number) {
        const op = this.rows.insertSegmentLocal(start, new RunSegment(new Array(count).fill(unallocated)));
        (op as any).target = "rows";
        this.submitLocalMessage(op);
    }

    public submitCellMessage(key: number, message: IMatrixCellMsg) {
        const clientSequenceNumber = this.submitLocalMessage(message);
        if (clientSequenceNumber !== -1) {
            this.cellKeyToCliSeq.set(key, clientSequenceNumber);
        }
    }

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [{
                mode: FileMode.Directory,
                path: SnapshotPath.rows,
                type: TreeEntry[TreeEntry.Tree],
                value: this.rows.snapshot(this.runtime, this.handle),
            }, {
                mode: FileMode.Directory,
                path: SnapshotPath.cols,
                type: TreeEntry[TreeEntry.Tree],
                value: this.cols.snapshot(this.runtime, this.handle),
            }],
            id: null,
        };

        return tree;
    }

    protected submitLocalMessage(message: any) {
        return super.submitLocalMessage(
            serializeHandles(
                message,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle));
    }

    protected onConnect(pending: any[]) {
        assert.equal(
            this.rows.getCollabWindow().collaborating,
            this.cols.getCollabWindow().collaborating,
        );

        // Update merge tree collaboration information with new client ID and then resend pending ops
        if (this.rows.getCollabWindow().collaborating) {
            this.rows.updateCollaboration(this.runtime.clientId);
            this.cols.updateCollaboration(this.runtime.clientId);
        }

        // TODO: Resend pending ops on reconnect
        assert(!this.rows.resetPendingSegmentsToOp());
        assert(!this.cols.resetPendingSegmentsToOp());
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(branchId: string, storage: IObjectStorageService) {
        try {
            await this.rows.load(branchId, this.runtime, new ContentObjectStorage(storage, SnapshotPath.rows));
            await this.cols.load(branchId, this.runtime, new ContentObjectStorage(storage, SnapshotPath.cols));
        } catch (error) {
            this.logger.sendErrorEvent({eventName: "MatrixLoadFailed" }, error);
        }
    }

    protected processCore(rawMessage: ISequencedDocumentMessage, local: boolean) {
        const msg = parseHandles(
            rawMessage,
            this.runtime.IComponentSerializer,
            this.runtime.IComponentHandleContext);

        const contents = msg.contents;

        switch (contents.target) {
            case "cols":
                this.cols.applyMsg(msg);
                break;
            case "rows":
                this.rows.applyMsg(msg);
                break;
            default: {
                // Early exit if this is the acknowledgement for a local op.
                const [row, col] = this.swizzle(contents.row, contents.col, /* alloc */ false);
                const pendingCliSeq = this.cellKeyToCliSeq.get(pointToKey(row, col));
                if (pendingCliSeq !== undefined) {
                    if (local && pendingCliSeq === rawMessage.clientSequenceNumber) {
                        this.cellKeyToCliSeq.delete(contents.key);
                    }
                    return;
                } else {
                    this.storeCell(contents.row, contents.col, contents.value);
                }
            }
        }
    }

    protected registerCore() {
        this.rows.startCollaboration(this.runtime.clientId, 0);
        this.cols.startCollaboration(this.runtime.clientId, 0);
    }

    private storeCell(row: number, col: number, value: T) {
        const clear = value === undefined;

        // tslint:disable-next-line:no-parameter-reassignment
        ([row, col] = this.swizzle(row, col, /* alloc: */ !clear));

        // If either the row or col is unallocated, the cell has already been cleared.
        if (clear && row === unallocated || col === unallocated) {
            return;
        }

        const key = pointToKey(row, col);
        if (clear) {
            this.cellKeyToValue.delete(key);
        } else {
            this.cellKeyToValue.set(key, value);
        }

        return key;
    }

    private swizzle1(client: Client, table: HandleTable<number>, pos: number, alloc: boolean): number {
        const segmentAndOffset = client.getContainingSegment(pos);
        assert(segmentAndOffset);
        const run = segmentAndOffset.segment as RunSegment;
        let p = run.items[segmentAndOffset.offset] as number;
        if (p === unallocated && alloc) {
            p = table.allocate() - 1;
            run.items[segmentAndOffset.offset] = p;
        }
        return p;
    }

    private swizzle(row: number, col: number, alloc: boolean) {
        return [
            this.swizzle1(this.rows, this.rowTable, row, alloc),
            this.swizzle1(this.cols, this.colTable, col, alloc),
        ];
    }
}
