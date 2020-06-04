/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    Serializable,
    IChannelAttributes,
} from "@fluidframework/component-runtime-definitions";
import { makeHandlesSerializable, parseHandles, SharedObject } from "@fluidframework/shared-object-base";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import { IMatrixProducer, IMatrixConsumer, IMatrixReader, IMatrixWriter } from "@tiny-calc/nano";
import { debug } from "./debug";
import { MatrixOp } from "./ops";
import { PermutationVector } from "./permutationvector";
import { SparseArray2D } from "./sparsearray2d";
import { SharedMatrixFactory } from "./runtime";
import { Handle } from "./handletable";
import { deserializeBlob, serializeBlob } from "./serialization";

const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
    cells = "cells",
}

export class SharedMatrix<T extends Serializable = Serializable>
    extends SharedObject
    implements IMatrixProducer<T | undefined | null>,
        IMatrixReader<T | undefined | null>,
        IMatrixWriter<T | undefined>
{
    private readonly consumers = new Set<IMatrixConsumer<T | undefined | null>>();

    public static getFactory() { return new SharedMatrixFactory(); }

    private readonly rows: PermutationVector;   // Map logical row to storage handle (if any)
    private readonly cols: PermutationVector;   // Map logical col to storage handle (if any)

    private cells = new SparseArray2D<T>();                    // Stores cell values.
    private pendingCliSeqs = new SparseArray2D<number>();      // Tracks pending writes.
    private readonly pendingQueue: { cliSeq: number, rowHandle: number, colHandle: number }[] = [];

    constructor(runtime: IComponentRuntime, public id: string, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.rows = new PermutationVector(
            SnapshotPath.rows,
            this.logger,
            runtime.options,
            this.onRowDelta,
            this.onRowHandlesRecycled);

        this.cols = new PermutationVector(
            SnapshotPath.cols,
            this.logger,
            runtime.options,
            this.onColDelta,
            this.onColHandlesRecycled);
    }

    public static create<T extends Serializable = Serializable>(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, SharedMatrixFactory.Type) as SharedMatrix<T>;
    }

    // #region IMatrixProducer

    openMatrix(consumer: IMatrixConsumer<T | undefined | null>): IMatrixReader<T | undefined | null> {
        this.consumers.add(consumer);
        return this;
    }

    closeMatrix(consumer: IMatrixConsumer<T | undefined | null>): void {
        this.consumers.delete(consumer);
    }

    // #endregion IMatrixProducer

    // #region IMatrixReader

    public get rowCount() { return this.rows.getLength(); }
    public get colCount() { return this.cols.getLength(); }

    public getCell(row: number, col: number): T | undefined | null {
        // Map the logical (row, col) to associated storage handles.
        const rowHandle = this.rows.handles[row];

        // Perf: Leverage the JavaScript behavior of returning `undefined` for out of bounds
        //       array access to detect bad coordinates. (~4% faster vs. an unconditional
        //       assert with range check on node v12 x64)
        if (!(rowHandle >= Handle.valid)) {
            assert(rowHandle === Handle.unallocated, "'row' out of range.");
            assert(0 <= col && col < this.colCount, "'col' out of range.");
            return undefined;
        }

        const colHandle = this.cols.handles[col];

        // Perf: Leverage the JavaScript behavior of returning `undefined` for out of bounds
        //       array access to detect bad coordinates. (~4% faster vs. an unconditional
        //       assert with range check on node v12 x64)
        if (!(colHandle >= Handle.valid)) {
            assert(colHandle === Handle.unallocated, "'col' out of range.");
            return undefined;
        }

        return this.cells.getCell(rowHandle, colHandle);
    }

    public get matrixProducer(): IMatrixProducer<T | undefined | null> { return this; }

    // #endregion IMatrixReader

    public setCell(row: number, col: number, value: T) {
        assert(0 <= row && row < this.rowCount
            && 0 <= col && col < this.colCount);

        this.setCellCore(row, col, value);

        // Avoid reentrancy by raising change notifications after the op is queued.
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(row, col, 1, 1, this);
        }
    }

    public setCells(rowStart: number, colStart: number, colCount: number, values: readonly T[]) {
        const rowCount = Math.ceil(values.length / colCount);

        assert((0 <= rowStart && rowStart < this.rowCount)
            && (0 <= colStart && colStart < this.colCount)
            && (1 <= colCount && colCount <= (this.colCount - colStart))
            && (rowCount <= (this.rowCount - rowStart)));

        const endCol = colStart + colCount;
        let r = rowStart;
        let c = colStart;

        for (const value of values) {
            this.setCellCore(r, c, value);

            if (++c === endCol) {
                c = colStart;
                r++;
            }
        }

        // Avoid reentrancy by raising change notifications after the op is queued.
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(rowStart, colStart, rowCount, colCount, this);
        }
    }

    private setCellCore(
        row: number,
        col: number,
        value: T,
    ) {
        const rowHandle = this.rows.getAllocatedHandle(row);
        const colHandle = this.cols.getAllocatedHandle(col);

        this.cells.setCell(rowHandle, colHandle, value);
        const cliSeq = this.submitLocalMessage({
            type: MatrixOp.set,
            row,
            col,
            value,
        });

        if (cliSeq !== -1) {
            this.pendingCliSeqs.setCell(rowHandle, colHandle, cliSeq);
            this.pendingQueue.push({ cliSeq, rowHandle, colHandle });
        }
    }

    public insertCols(colStart: number, count: number) {
        this.insert(this.cols, SnapshotPath.cols, colStart, count);
    }

    public removeCols(colStart: number, count: number) {
        this.remove(this.cols, SnapshotPath.cols, colStart, count);
    }

    public insertRows(rowStart: number, count: number) {
        this.insert(this.rows, SnapshotPath.rows, rowStart, count);
    }

    public removeRows(rowStart: number, count: number) {
        this.remove(this.rows, SnapshotPath.rows, rowStart, count);
    }

    public snapshot(): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.rows,
                    type: TreeEntry[TreeEntry.Tree],
                    value: this.rows.snapshot(this.runtime, this.handle),
                },
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.cols,
                    type: TreeEntry[TreeEntry.Tree],
                    value: this.cols.snapshot(this.runtime, this.handle),
                },
                serializeBlob(this.runtime, this.handle, SnapshotPath.cells, [
                    this.cells.snapshot(),
                    this.pendingCliSeqs.snapshot(),
                ]),
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    protected submitLocalMessage(message: any) {
        return super.submitLocalMessage(
            makeHandlesSerializable(
                message,
                this.runtime.IComponentSerializer,
                this.runtime.IComponentHandleContext,
                this.handle,
            ),
        );
    }

    protected onConnect() {
        assert.equal(this.rows.getCollabWindow().collaborating, this.cols.getCollabWindow().collaborating);

        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.rows.startOrUpdateCollaboration(this.runtime.clientId as string);
        this.cols.startOrUpdateCollaboration(this.runtime.clientId as string);

        // TODO: Resend pending ops on reconnect
        assert(this.rows.peekPendingSegmentGroups() === undefined);
        assert(this.cols.peekPendingSegmentGroups() === undefined);
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(branchId: string, storage: IObjectStorageService) {
        try {
            await this.rows.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.rows), branchId);
            await this.cols.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.cols), branchId);
            const [cellData, pendingCliSeqData] = await deserializeBlob(this.runtime, storage, SnapshotPath.cells);

            this.cells = SparseArray2D.load(cellData);
            this.pendingCliSeqs = SparseArray2D.load(pendingCliSeqData);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "MatrixLoadFailed" }, error);
        }
    }

    protected processCore(rawMessage: ISequencedDocumentMessage, local: boolean) {
        const msg = parseHandles(rawMessage, this.runtime.IComponentSerializer, this.runtime.IComponentHandleContext);

        const contents = msg.contents;

        switch (contents.target) {
            case SnapshotPath.cols:
                this.cols.applyMsg(msg);
                break;
            case SnapshotPath.rows:
                this.rows.applyMsg(msg);
                break;
            default: {
                assert(contents.type === MatrixOp.set);

                const { referenceSequenceNumber: refSeq, clientId } = rawMessage;
                const { row, col } = contents;

                if (local) {
                    // We are receiving the ACK for a local pending set operation.

                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const { cliSeq, rowHandle, colHandle } = this.pendingQueue.shift()!;

                    assert.equal(rawMessage.clientSequenceNumber, cliSeq);

                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const actualCliSeq = this.pendingCliSeqs.getCell(rowHandle, colHandle)!;

                    // Note while we're awaiting the local set, it's possible for the row/col to be locally
                    // removed and the row/col handles recycled.  If this happens, the actualCliSeq will be
                    // 'undefined' or > 'cliSeq'.
                    assert(!(actualCliSeq < cliSeq));

                    // If this is the most recent write to the cell by the local client, remove our
                    // entry from 'pendingCliSeqs' to resume allowing remote writes.
                    if (actualCliSeq === cliSeq) {
                        this.pendingCliSeqs.setCell(rowHandle, colHandle, undefined);
                    }
                } else {
                    const rowClientId = this.rows.getOrAddShortClientId(clientId);
                    const adjustedRow = this.rows.adjustPosition(row, refSeq, rowClientId);

                    if (adjustedRow !== undefined) {
                        const colClientId = this.cols.getOrAddShortClientId(clientId);
                        const adjustedCol = this.cols.adjustPosition(col, refSeq, colClientId);

                        if (adjustedCol !== undefined) {
                            const rowHandle = this.rows.getAllocatedHandle(adjustedRow);
                            const colHandle = this.cols.getAllocatedHandle(adjustedCol);

                            assert(rowHandle >= Handle.valid
                                && colHandle >= Handle.valid);

                            if (this.pendingCliSeqs.getCell(rowHandle, colHandle) === undefined) {
                                const { value } = contents;
                                this.cells.setCell(rowHandle, colHandle, value);

                                for (const consumer of this.consumers.values()) {
                                    consumer.cellsChanged(adjustedRow, adjustedCol, 1, 1, this);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    protected registerCore() {
        this.rows.startOrUpdateCollaboration(this.runtime.clientId, 0);
        this.cols.startOrUpdateCollaboration(this.runtime.clientId, 0);
    }

    private insert(
        vector: PermutationVector,
        dimension: SnapshotPath.rows | SnapshotPath.cols,
        start: number,
        count: number,
    ) {
        // Construct a new MergeTree op to insert a new segment with the appropriate number of unallocated rows/cols.
        // Note that serialized RunSegment will continue to contain unallocated items, even if the RunSegment in
        // the MergeTree is modified prior to the op being transmitted.
        const op = vector.insert(start, count);

        // Note whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
        (op as any).target = dimension;

        this.submitLocalMessage(op);
    }

    private remove(
        vector: PermutationVector,
        dimension: SnapshotPath.rows | SnapshotPath.cols,
        start: number,
        count: number,
    ) {
        const op = vector.remove(start, count);

        // Note whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
        (op as any).target = dimension;

        this.submitLocalMessage(op);
    }

    // Invoked by PermutationVector to notify IMatrixConsumers of row insertion/deletions.
    private readonly onRowDelta = (position: number, removedCount: number, insertedCount: number) => {
        for (const consumer of this.consumers) {
            consumer.rowsChanged(position, removedCount, insertedCount, this);
        }
    };

    // Invoked by PermutationVector to notify IMatrixConsumers of col insertion/deletions.
    private readonly onColDelta = (position: number, removedCount: number, insertedCount: number) => {
        for (const consumer of this.consumers) {
            consumer.colsChanged(position, removedCount, insertedCount, this);
        }
    };

    private readonly onRowHandlesRecycled = (rowHandles: Handle[]) => {
        for (let col = 0; col < this.colCount; col++) {
            const colHandle = this.cols.handles[col];
            if (colHandle !== Handle.unallocated) {
                for (const rowHandle of rowHandles) {
                    this.cells.setCell(rowHandle, colHandle, undefined);
                    this.pendingCliSeqs.setCell(rowHandle, colHandle, undefined);
                }
            }
        }
    };

    private readonly onColHandlesRecycled = (colHandles: Handle[]) => {
        for (let row = 0; row < this.rowCount; row++) {
            const rowHandle = this.rows.handles[row];
            if (rowHandle !== Handle.unallocated) {
                for (const colHandle of colHandles) {
                    this.cells.setCell(rowHandle, colHandle, undefined);
                    this.pendingCliSeqs.setCell(rowHandle, colHandle, undefined);
                }
            }
        }
    };

    public toString() {
        let s = `client:${this.runtime.clientId}\nrows: ${this.rows.toString()}\ncols: ${this.cols.toString()}\n\n`;

        for (let r = 0; r < this.rowCount; r++) {
            s += `  [`;
            for (let c = 0; c < this.colCount; c++) {
                if (c > 0) {
                    s += ", ";
                }

                s += `${JSON.stringify(this.getCell(r, c))}`;
            }
            s += "]\n";
        }

        return `${s}\n`;
    }
}
