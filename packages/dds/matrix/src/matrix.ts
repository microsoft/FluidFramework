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
    IFluidDataStoreRuntime,
    IChannelStorageService,
    Serializable,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { makeHandlesSerializable, parseHandles, SharedObject } from "@fluidframework/shared-object-base";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import {
    IMatrixProducer,
    IMatrixConsumer,
    IMatrixReader,
    IMatrixWriter,
    IMatrixIterator,
    MatrixIteratorSpec,
} from "@tiny-calc/nano";
import { MergeTreeDeltaType, IMergeTreeOp, SegmentGroup, ISegment } from "@fluidframework/merge-tree";
import { debug } from "./debug";
import { MatrixOp } from "./ops";
import { PermutationVector, PermutationSegment } from "./permutationvector";
import { SparseArray2D } from "./sparsearray2d";
import { SharedMatrixFactory } from "./runtime";
import { Handle, isHandleValid } from "./handletable";
import { deserializeBlob, serializeBlob } from "./serialization";
import { ensureRange } from "./range";
import { IUndoConsumer } from "./types";
import { MatrixUndoProvider } from "./undoprovider";

const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
    cells = "cells",
}

interface ISetOp<T> {
    type: MatrixOp.set,
    row: number,
    col: number,
    value: T,
}

interface ISetOpMetadata {
    rowHandle: Handle,
    colHandle: Handle,
    localSeq: number,
}

export class SharedMatrix<T extends Serializable = Serializable>
    extends SharedObject
    implements IMatrixProducer<T | undefined | null>,
    IMatrixReader<T | undefined | null>,
    IMatrixWriter<T | undefined>,
    IMatrixIterator<T | undefined | null>
{
    private readonly consumers = new Set<IMatrixConsumer<T | undefined | null>>();

    public static getFactory() { return new SharedMatrixFactory(); }

    private readonly rows: PermutationVector;   // Map logical row to storage handle (if any)
    private readonly cols: PermutationVector;   // Map logical col to storage handle (if any)

    private cells = new SparseArray2D<T>();         // Stores cell values.
    private annotations = new SparseArray2D<T>();   // Tracks cell annotations.
    private pending = new SparseArray2D<number>();  // Tracks pending writes.

    constructor(runtime: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(id, runtime, attributes);

        this.rows = new PermutationVector(
            SnapshotPath.rows,
            this.logger,
            runtime,
            this.onRowDelta,
            this.onRowHandlesRecycled);

        this.cols = new PermutationVector(
            SnapshotPath.cols,
            this.logger,
            runtime,
            this.onColDelta,
            this.onColHandlesRecycled);
    }

    private undo?: MatrixUndoProvider;

    public openUndo(consumer: IUndoConsumer) {
        assert.equal(this.undo, undefined);
        this.undo = new MatrixUndoProvider(consumer, this, this.rows, this.cols);
    }

    // TODO: closeUndo()?

    private get rowHandles() { return this.rows.handleCache; }
    private get colHandles() { return this.cols.handleCache; }

    public static create<T extends Serializable = Serializable>(runtime: IFluidDataStoreRuntime, id?: string) {
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
        // Perf: When possible, bounds checking is performed inside the implementation for
        //       'getHandle()' so that it can be elided in the case of a cache hit.  This
        //       yields an ~40% improvement in the case of a cache hit (node v12 x64)

        // Map the logical (row, col) to associated storage handles.
        const rowHandle = this.rowHandles.getHandle(row);
        if (isHandleValid(rowHandle)) {
            const colHandle = this.colHandles.getHandle(col);
            if (isHandleValid(colHandle)) {
                return this.cells.getCell(rowHandle, colHandle);
            }
        } else {
            // If we early exit because the given rowHandle is unallocated, we still need to
            // bounds-check the 'col' parameter.
            ensureRange(col, this.cols.getLength());
        }

        return undefined;
    }

    public get matrixProducer(): IMatrixProducer<T | undefined | null> { return this; }

    // #endregion IMatrixReader

    // #region IMatrixIterator

    public forEachCell(
        callback: (value: T | undefined | null, row: number, column: number) => void,
        spec?: MatrixIteratorSpec,
    ) {
        const includeEmpty = spec?.includeEmpty ?? false;
        const rowStart = spec?.rowStart ?? 0;
        const colStart = spec?.colStart ?? 0;
        const rowCount = spec?.rowCount ?? this.rowCount;
        const colCount = spec?.colCount ?? this.colCount;
        for (let i = 0; i < rowCount; i++) {
            const row = rowStart + i;
            const rowHandle = this.rows.getMaybeHandle(row);
            if (!isHandleValid(rowHandle)) {
                if (includeEmpty) {
                    for (let j = 0; j < colCount; j++) {
                        callback(undefined, row, colStart + j);
                    }
                }
                continue;
            }
            for (let j = 0; j < colCount; j++) {
                const col = colStart + j;
                const colHandle = this.cols.getMaybeHandle(col);
                if (!isHandleValid(colHandle)) {
                    if (includeEmpty) {
                        callback(undefined, row, col);
                    }
                }
                else {
                    const content = this.cells.getCell(rowHandle, colHandle);
                    if (content !== undefined || includeEmpty) {
                        callback(content, row, col);
                    }
                }
            }
        }
    }

    // #endregion IMatrixIterator

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
        rowHandle = this.rows.getAllocatedHandle(row),
        colHandle = this.cols.getAllocatedHandle(col),
    ) {
        if (this.undo !== undefined) {
            this.undo.cellSet(
                rowHandle,
                colHandle,
                /* oldvalue: */ this.cells.getCell(rowHandle, colHandle));
        }

        this.cells.setCell(rowHandle, colHandle, value);
        this.annotations.setCell(rowHandle, colHandle, undefined);

        this.sendSetCellOp(row, col, value, rowHandle, colHandle);
    }

    private sendSetCellOp(row: number, col: number, value: T, rowHandle: Handle, colHandle: Handle) {
        // If the SharedMatrix is local, it will by synchronized via a Snapshot when initially connected.
        // Do not queue a message or track the pending op, as there will never be an ACK, etc.
        if (this.isAttached()) {
            const localSeq = this.nextLocalSeq();

            const op: ISetOp<T> = {
                type: MatrixOp.set,
                row,
                col,
                value,
            };

            const metadata: ISetOpMetadata = {
                rowHandle,
                colHandle,
                localSeq,
            };

            this.submitLocalMessage(op, metadata);

            this.pending.setCell(rowHandle, colHandle, localSeq);
        }
    }

    public getAnnotation(row: number, col: number): T | undefined | null {
        const rowHandle = this.rows.getMaybeHandle(row);
        if (isHandleValid(rowHandle)) {
            const colHandle = this.cols.getMaybeHandle(col);
            if (isHandleValid(colHandle)) {
                return this.annotations.getCell(rowHandle, colHandle);
            }
        }
        return undefined;
    }

    public setAnnotation(row: number, col: number, value: T) {
        assert(0 <= row && row < this.rowCount
            && 0 <= col && col < this.colCount);
        const rowHandle = this.rows.getAllocatedHandle(row);
        const colHandle = this.cols.getAllocatedHandle(col);
        this.annotations.setCell(rowHandle, colHandle, value);
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(row, col, 1, 1, this);
        }
    }

    private submitVectorMessage(
        currentVector: PermutationVector,
        oppositeVector: PermutationVector,
        dimension: SnapshotPath.rows | SnapshotPath.cols,
        message: any,
    ) {
        // Ideally, we would have a single 'localSeq' counter that is shared between both PermutationVectors
        // and the SharedMatrix's cell data.  Instead, we externally advance each MergeTree's 'localSeq' counter
        // for each submitted op it not aware of to keep them synchronized.
        const localSeq = currentVector.getCollabWindow().localSeq;
        const oppositeWindow = oppositeVector.getCollabWindow();

        // Note that the comparison is '>=' because, in the case the MergeTree is regenerating ops for reconnection,
        // the MergeTree submits the op with the original 'localSeq'.
        assert(localSeq >= oppositeWindow.localSeq,
            "The 'localSeq' of the vector submitting an op must >= the 'localSeq' of the other vector.");

        oppositeWindow.localSeq = localSeq;

        // If the SharedMatrix is local, it's state will be submitted via a Snapshot when initially connected.
        // Do not queue a message or track the pending op, as there will never be an ACK, etc.
        if (this.isAttached()) {
            // Record whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
            message.target = dimension;

            this.submitLocalMessage(
                message,
                currentVector.peekPendingSegmentGroups(
                    message.type === MergeTreeDeltaType.GROUP
                        ? message.ops.length
                        : 1));
        }
    }

    private submitColMessage(message: any) {
        this.submitVectorMessage(this.cols, this.rows, SnapshotPath.cols, message);
    }

    public insertCols(colStart: number, count: number) {
        this.submitColMessage(this.cols.insert(colStart, count));
    }

    public removeCols(colStart: number, count: number) {
        this.submitColMessage(this.cols.remove(colStart, count));
    }

    private submitRowMessage(message: any) {
        this.submitVectorMessage(this.rows, this.cols, SnapshotPath.rows, message);
    }

    public insertRows(rowStart: number, count: number) {
        this.submitRowMessage(this.rows.insert(rowStart, count));
    }

    public removeRows(rowStart: number, count: number) {
        this.submitRowMessage(this.rows.remove(rowStart, count));
    }

    /** @internal */ public _undoRemoveRows(segment: ISegment) {
        const original = segment as PermutationSegment;

        // (Re)insert the removed number of rows at the original position.
        const { op, inserted } = this.rows.insertRelative(original, original.cachedLength);
        this.submitRowMessage(op);

        // Transfer handles from the original segment to the newly inserted empty segment.
        original.transferHandlesTo(inserted);

        // Invalidate the handleCache in case it was populated during the 'rowsChanged'
        // callback, which occurs before the handle span is populated.
        const rowStart = this.rows.getPosition(inserted);
        this.rows.handleCache.itemsChanged(
            rowStart,
            /* removedCount: */ 0,
            /* insertedCount: */ inserted.cachedLength);

        // Generate setCell ops for each populated cell in the reinserted rows.
        let rowHandle = inserted.start;
        const rowCount = inserted.cachedLength;
        for (let row = rowStart; row < rowStart + rowCount; row++, rowHandle++) {
            for (let col = 0; col < this.colCount; col++) {
                const colHandle = this.colHandles.getHandle(col);
                const value = this.cells.getCell(rowHandle, colHandle);
                // eslint-disable-next-line no-null/no-null
                if (value !== undefined && value !== null) {
                    this.sendSetCellOp(
                        row,
                        col,
                        value,
                        rowHandle,
                        colHandle);
                }
            }
        }

        // Avoid reentrancy by raising change notifications after the op is queued.
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(rowStart, /* colStart: */ 0, rowCount, this.colCount, this);
        }
    }

    /** @internal */ public _undoRemoveCols(segment: ISegment) {
        const original = segment as PermutationSegment;

        // (Re)insert the removed number of columns at the original position.
        const { op, inserted } = this.cols.insertRelative(original, original.cachedLength);
        this.submitColMessage(op);

        // Transfer handles from the original segment to the newly inserted empty segment.
        original.transferHandlesTo(inserted);

        // Invalidate the handleCache in case it was populated during the 'colsChanged'
        // callback, which occurs before the handle span is populated.
        const colStart = this.cols.getPosition(inserted);
        this.cols.handleCache.itemsChanged(
            colStart,
            /* removedCount: */ 0,
            /* insertedCount: */ inserted.cachedLength);

        // Generate setCell ops for each populated cell in the reinserted cols.
        let colHandle = inserted.start;
        const colCount = inserted.cachedLength;
        for (let col = colStart; col < colStart + colCount; col++, colHandle++) {
            for (let row = 0; row < this.rowCount; row++) {
                const rowHandle = this.rowHandles.getHandle(row);
                const value = this.cells.getCell(rowHandle, colHandle);
                // eslint-disable-next-line no-null/no-null
                if (value !== undefined && value !== null) {
                    this.sendSetCellOp(
                        row,
                        col,
                        value,
                        rowHandle,
                        colHandle);
                }
            }
        }

        // Avoid reentrancy by raising change notifications after the op is queued.
        for (const consumer of this.consumers.values()) {
            consumer.cellsChanged(/* rowStart: */ 0, colStart, this.rowCount, colCount, this);
        }
    }

    public snapshot(): ITree {
        return {
            entries: [
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.rows,
                    type: TreeEntry.Tree,
                    value: this.rows.snapshot(this.runtime, this.handle),
                },
                {
                    mode: FileMode.Directory,
                    path: SnapshotPath.cols,
                    type: TreeEntry.Tree,
                    value: this.cols.snapshot(this.runtime, this.handle),
                },
                serializeBlob(this.runtime, this.handle, SnapshotPath.cells, [
                    this.cells.snapshot(),
                    this.pending.snapshot(),
                ]),
            ],
            id: null,   // eslint-disable-line no-null/no-null
        };
    }

    /**
     * Advances the 'localSeq' counter for the cell data operation currently being queued.
     *
     * Do not use with 'submitColMessage()/submitRowMessage()' as these helpers + the MergeTree will
     * automatically advance 'localSeq'.
     */
    private nextLocalSeq() {
        // Ideally, we would have a single 'localSeq' counter that is shared between both PermutationVectors
        // and the SharedMatrix's cell data.  Instead, we externally bump each MergeTree's 'localSeq' counter
        // for SharedMatrix ops it's not aware of to keep them synchronized.  (For cell data operations, we
        // need to bump both counters.)

        this.cols.getCollabWindow().localSeq++;
        return ++this.rows.getCollabWindow().localSeq;
    }

    protected submitLocalMessage(message: any, localOpMetadata?: any) {
        // TODO: Recommend moving this assertion into SharedObject
        //       (See https://github.com/microsoft/FluidFramework/issues/2559)
        assert.equal(this.isAttached(), true);

        super.submitLocalMessage(
            makeHandlesSerializable(
                message,
                this.runtime.IFluidSerializer,
                this.handle,
            ),
            localOpMetadata,
        );

        // Ensure that row/col 'localSeq' are synchronized (see 'nextLocalSeq()').
        assert.equal(
            this.rows.getCollabWindow().localSeq,
            this.cols.getCollabWindow().localSeq,
        );
    }

    protected didAttach() {
        // We've attached we need to start generating and sending ops.
        // so start collaboration and provide a default client id incase we are not connected
        if (this.isAttached()) {
            this.rows.startOrUpdateCollaboration(this.runtime.clientId ?? "attached");
            this.cols.startOrUpdateCollaboration(this.runtime.clientId ?? "attached");
        }
    }

    protected onConnect() {
        assert.equal(this.rows.getCollabWindow().collaborating, this.cols.getCollabWindow().collaborating);

        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.rows.startOrUpdateCollaboration(this.runtime.clientId as string);
        this.cols.startOrUpdateCollaboration(this.runtime.clientId as string);
    }

    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        switch (content.target) {
            case SnapshotPath.cols:
                this.submitColMessage(this.cols.regeneratePendingOp(
                    content as IMergeTreeOp,
                    localOpMetadata as SegmentGroup | SegmentGroup[]));
                break;
            case SnapshotPath.rows:
                this.submitRowMessage(this.rows.regeneratePendingOp(
                    content as IMergeTreeOp,
                    localOpMetadata as SegmentGroup | SegmentGroup[]));
                break;
            default: {
                assert(content.type === MatrixOp.set, "Unknown SharedMatrix 'op' type.");

                const setOp = content as ISetOp<T>;
                const { rowHandle, colHandle, localSeq } = localOpMetadata as ISetOpMetadata;

                // If there are more pending local writes to the same row/col handle, it is important
                // to skip resubmitting this op since it is possible the row/col handle has been recycled
                // and now refers to a different position than when this op was originally submitted.
                if (this.isLatestPendingWrite(rowHandle, colHandle, localSeq)) {
                    const row = this.rows.handleToPosition(rowHandle, localSeq);
                    const col = this.cols.handleToPosition(colHandle, localSeq);

                    if (row >= 0 && col >= 0) {
                        this.setCellCore(
                            row,
                            col,
                            setOp.value,
                            rowHandle,
                            colHandle,
                        );
                    }
                }
                break;
            }
        }
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected async loadCore(branchId: string | undefined, storage: IChannelStorageService) {
        try {
            await this.rows.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.rows), branchId);
            await this.cols.load(this.runtime, new ObjectStoragePartition(storage, SnapshotPath.cols), branchId);
            const [cellData, pendingCliSeqData] = await deserializeBlob(this.runtime, storage, SnapshotPath.cells);

            this.cells = SparseArray2D.load(cellData);
            this.annotations = new SparseArray2D();
            this.pending = SparseArray2D.load(pendingCliSeqData);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "MatrixLoadFailed" }, error);
        }
    }

    protected processCore(rawMessage: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        const msg = parseHandles(rawMessage, this.runtime.IFluidSerializer);

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
                    const { rowHandle, colHandle, localSeq } = localOpMetadata as ISetOpMetadata;

                    // If this is the most recent write to the cell by the local client, remove our
                    // entry from 'pendingCliSeqs' to resume allowing remote writes.
                    if (this.isLatestPendingWrite(rowHandle, colHandle, localSeq)) {
                        this.pending.setCell(rowHandle, colHandle, undefined);
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

                            assert(isHandleValid(rowHandle) && isHandleValid(colHandle));

                            // If there is a pending (unACKed) local write to the same cell, skip the current op
                            // since it "happened before" the pending write.
                            if (this.pending.getCell(rowHandle, colHandle) === undefined) {
                                const { value } = contents;
                                this.cells.setCell(rowHandle, colHandle, value);
                                this.annotations.setCell(rowHandle, colHandle, undefined);

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
        for (const rowHandle of rowHandles) {
            this.cells.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
            this.annotations.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
            this.pending.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
        }
    };

    private readonly onColHandlesRecycled = (colHandles: Handle[]) => {
        for (const colHandle of colHandles) {
            this.cells.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
            this.annotations.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
            this.pending.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
        }
    };

    /**
     * Returns true if the latest pending write to the cell indicated by the given row/col handles
     * matches the given 'localSeq'.
     *
     * A return value of `true` indicates that there are no later local operations queued that will
     * clobber the write op at the given 'localSeq'.  This includes later ops that overwrite the cell
     * with a different value as well as row/col removals that might recycled the given row/col handles.
     */
    private isLatestPendingWrite(rowHandle: Handle, colHandle: Handle, localSeq: number) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pendingLocalSeq = this.pending.getCell(rowHandle, colHandle)!;

        // Note while we're awaiting the ACK for a local set, it's possible for the row/col to be
        // locally removed and the row/col handles recycled.  If this happens, the pendingLocalSeq will
        // be 'undefined' or > 'localSeq'.
        assert(!(pendingLocalSeq < localSeq),
            "The 'localSeq' of pending write (if any) must be <= the localSeq of the currently processed op.");

        // If this is the most recent write to the cell by the local client, the stored localSeq
        // will be an exact match for the given 'localSeq'.
        return pendingLocalSeq === localSeq;
    }

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
