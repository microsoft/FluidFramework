/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IEvent,
	IEventThisPlaceHolder,
	type IEventProvider,
} from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	type IChannel,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	// eslint-disable-next-line import/no-deprecated
	Client,
	IJSONSegment,
	IMergeTreeOp,
	type ISegmentInternal,
	type LocalReferencePosition,
	MergeTreeDeltaType,
	ReferenceType,
	// eslint-disable-next-line import/no-deprecated
	SegmentGroup,
} from "@fluidframework/merge-tree/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import {
	ObjectStoragePartition,
	SummaryTreeBuilder,
} from "@fluidframework/runtime-utils/internal";
import {
	IFluidSerializer,
	ISharedObjectEvents,
	SharedObject,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	IMatrixConsumer,
	IMatrixProducer,
	IMatrixReader,
	IMatrixWriter,
} from "@tiny-calc/nano";
import Deque from "double-ended-queue";

import type { HandleCache } from "./handlecache.js";
import { Handle, isHandleValid } from "./handletable.js";
import {
	ISetOp,
	MatrixItem,
	MatrixOp,
	MatrixSetOrVectorOp,
	SnapshotPath,
	VectorOp,
} from "./ops.js";
import { PermutationVector, reinsertSegmentIntoVector } from "./permutationvector.js";
import { ensureRange } from "./range.js";
import { deserializeBlob } from "./serialization.js";
import { SparseArray2D, type RecurArray } from "./sparsearray2d.js";
import { IUndoConsumer } from "./types.js";
import { MatrixUndoProvider } from "./undoprovider.js";

interface ISetOpMetadata {
	rowHandle: Handle;
	colHandle: Handle;
	localSeq: number;
	rowsRef: LocalReferencePosition;
	colsRef: LocalReferencePosition;
	referenceSeqNumber: number;
}

/**
 * Events emitted by Shared Matrix.
 * @legacy
 * @alpha
 */
export interface ISharedMatrixEvents<T> extends IEvent {
	/**
	 * This event is only emitted when the SetCell Resolution Policy is First Write Win(FWW).
	 * This is emitted when two clients race and send changes without observing each other changes,
	 * the changes that gets sequenced last would be rejected, and only client who's changes rejected
	 * would be notified via this event, with expectation that it will merge its changes back by
	 * accounting new information (state from winner of the race).
	 *
	 * @remarks Listener parameters:
	 *
	 * - `row` - Row number at which conflict happened.
	 *
	 * - `col` - Col number at which conflict happened.
	 *
	 * - `currentValue` - The current value of the cell.
	 *
	 * - `conflictingValue` - The value that this client tried to set in the cell and got ignored due to conflict.
	 *
	 * - `target` - The {@link ISharedMatrix} itself.
	 */
	(
		event: "conflict",
		listener: (
			row: number,
			col: number,
			currentValue: MatrixItem<T>,
			conflictingValue: MatrixItem<T>,
			target: IEventThisPlaceHolder,
		) => void,
	): void;
}

/**
 * This represents the item which is used to track the client which modified the cell last.
 */
interface CellLastWriteTrackerItem {
	seqNum: number; // Seq number of op which last modified this cell
	clientId: string; // clientId of the client which last modified this cell
}

/**
 * @legacy
 * @alpha
 */
// Changing this to `unknown` would be a breaking change.
// TODO: if possible, transition ISharedMatrix to not use `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ISharedMatrix<T = any>
	extends IEventProvider<ISharedMatrixEvents<T>>,
		IMatrixProducer<MatrixItem<T>>,
		IMatrixReader<MatrixItem<T>>,
		IMatrixWriter<MatrixItem<T>>,
		IChannel {
	/**
	 * Inserts columns into the matrix.
	 * @param colStart - Index of the first column to insert.
	 * @param count - Number of columns to insert.
	 * @remarks
	 * Inserting 0 columns is a noop.
	 */
	insertCols(colStart: number, count: number): void;
	/**
	 * Removes columns from the matrix.
	 * @param colStart - Index of the first column to remove.
	 * @param count - Number of columns to remove.
	 * @remarks
	 * Removing 0 columns is a noop.
	 */
	removeCols(colStart: number, count: number): void;
	/**
	 * Inserts rows into the matrix.
	 * @param rowStart - Index of the first row to insert.
	 * @param count - Number of rows to insert.
	 * @remarks
	 * Inserting 0 rows is a noop.
	 */
	insertRows(rowStart: number, count: number): void;
	/**
	 * Removes rows from the matrix.
	 * @param rowStart - Index of the first row to remove.
	 * @param count - Number of rows to remove.
	 * @remarks
	 * Removing 0 rows is a noop.
	 */
	removeRows(rowStart: number, count: number): void;

	/**
	 * Sets a range of cells in the matrix.
	 * Cells are set in consecutive columns between `colStart` and `colStart + colCount - 1`.
	 * When `values` has larger size than `colCount`, the extra values are inserted in subsequent rows
	 * a la text-wrapping.
	 * @param rowStart - Index of the row to start setting cells.
	 * @param colStart - Index of the column to start setting cells.
	 * @param colCount - Number of columns to set before wrapping to subsequent rows (if `values` has more items)
	 * @param values - Values to insert.
	 * @remarks
	 * This is not currently more efficient than calling `setCell` for each cell.
	 */
	setCells(
		rowStart: number,
		colStart: number,
		colCount: number,
		values: readonly MatrixItem<T>[],
	): void;

	/**
	 * Attach an {@link IUndoConsumer} to the matrix.
	 * @param consumer - Undo consumer which will receive revertibles from the matrix.
	 */
	openUndo(consumer: IUndoConsumer): void;

	/**
	 * Whether the current conflict resolution policy is first-write win (FWW).
	 * See {@link ISharedMatrix.switchSetCellPolicy} for more details.
	 */
	isSetCellConflictResolutionPolicyFWW(): boolean;

	/**
	 * Change the conflict resolution policy for setCell operations to first-write win (FWW).
	 *
	 * This API only switches from LWW to FWW and not from FWW to LWW.
	 *
	 * @privateRemarks
	 * The next SetOp which is sent will communicate this policy to other clients.
	 */
	switchSetCellPolicy(): void;
}

/**
 * A SharedMatrix holds a rectangular 2D array of values.  Supported operations
 * include setting values and inserting/removing rows and columns.
 *
 * Matrix values may be any Fluid serializable type, which is the set of JSON
 * serializable types extended to include IFluidHandles.
 *
 * Fluid's SharedMatrix implementation works equally well for dense and sparse
 * matrix data and physically stores data in Z-order to leverage CPU caches and
 * prefetching when reading in either row or column major order.  (See README.md
 * for more details.)
 * @legacy
 * @alpha
 */
// Changing this to `unknown` would be a breaking change.
// TODO: if possible, transition SharedMatrix to not use `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class SharedMatrix<T = any>
	extends SharedObject<ISharedMatrixEvents<T> & ISharedObjectEvents>
	implements ISharedMatrix<T>
{
	private readonly consumers = new Set<IMatrixConsumer<MatrixItem<T>>>();

	/**
	 * Note: this field only provides a lower-bound on the reference sequence numbers for in-flight ops.
	 * The exact reason isn't understood, but some e2e tests suggest that the runtime may sometimes process
	 * incoming leave/join ops before putting an op that this DDS submits over the wire.
	 *
	 * E.g. SharedMatrix submits an op while deltaManager has lastSequenceNumber = 10, but before the runtime
	 * puts this op over the wire, it processes a client join/leave op with sequence number 11, so the referenceSequenceNumber
	 * on the SharedMatrix op is 11.
	 */
	private readonly inFlightRefSeqs = new Deque<number>();
	readonly getMinInFlightRefSeq = (): number | undefined => this.inFlightRefSeqs.get(0);

	private readonly rows: PermutationVector; // Map logical row to storage handle (if any)
	private readonly cols: PermutationVector; // Map logical col to storage handle (if any)

	private cells = new SparseArray2D<MatrixItem<T>>(); // Stores cell values.
	private readonly pending = new SparseArray2D<number>(); // Tracks pending writes.
	private cellLastWriteTracker = new SparseArray2D<CellLastWriteTrackerItem>(); // Tracks last writes sequence number and clientId in a cell.
	// Tracks the seq number of Op at which policy switch happens from Last Write Win to First Write Win.
	private setCellLwwToFwwPolicySwitchOpSeqNumber: number;
	private userSwitchedSetCellPolicy = false; // Set to true when the user calls switchPolicy.

	// Used to track if there is any reentrancy in setCell code.
	private reentrantCount: number = 0;

	/**
	 * Constructor for the Shared Matrix
	 * @param runtime - DataStore runtime.
	 * @param id - id of the dds
	 * @param attributes - channel attributes
	 * @param _isSetCellConflictResolutionPolicyFWW - Conflict resolution for Matrix set op is First Writer Win in case of
	 * race condition. Client can still overwrite values in case of no race.
	 */
	constructor(
		runtime: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_matrix_");

		this.setCellLwwToFwwPolicySwitchOpSeqNumber = -1;
		this.rows = new PermutationVector(
			SnapshotPath.rows,
			this.logger,
			runtime,
			this.onRowDelta,
			this.onRowHandlesRecycled,
			this.getMinInFlightRefSeq,
		);

		this.cols = new PermutationVector(
			SnapshotPath.cols,
			this.logger,
			runtime,
			this.onColDelta,
			this.onColHandlesRecycled,
			this.getMinInFlightRefSeq,
		);
	}

	private undo?: MatrixUndoProvider<T>;

	/**
	 * Subscribes the given IUndoConsumer to the matrix.
	 */
	public openUndo(consumer: IUndoConsumer): void {
		assert(
			this.undo === undefined,
			0x019 /* "SharedMatrix.openUndo() supports at most a single IUndoConsumer." */,
		);

		this.undo = new MatrixUndoProvider(consumer, this, this.rows, this.cols);
	}

	// TODO: closeUndo()?

	private get rowHandles(): HandleCache {
		return this.rows.handleCache;
	}
	private get colHandles(): HandleCache {
		return this.cols.handleCache;
	}

	// #region IMatrixProducer

	openMatrix(consumer: IMatrixConsumer<MatrixItem<T>>): IMatrixReader<MatrixItem<T>> {
		this.consumers.add(consumer);
		return this;
	}

	closeMatrix(consumer: IMatrixConsumer<MatrixItem<T>>): void {
		this.consumers.delete(consumer);
	}

	// #endregion IMatrixProducer

	// #region IMatrixReader

	public get rowCount(): number {
		return this.rows.getLength();
	}
	public get colCount(): number {
		return this.cols.getLength();
	}

	public isSetCellConflictResolutionPolicyFWW(): boolean {
		return this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1 || this.userSwitchedSetCellPolicy;
	}

	public getCell(row: number, col: number): MatrixItem<T> {
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

	public get matrixProducer(): IMatrixProducer<MatrixItem<T>> {
		return this;
	}

	// #endregion IMatrixReader

	public setCell(row: number, col: number, value: MatrixItem<T>): void {
		if (row < 0 || row >= this.rowCount || col < 0 || col >= this.colCount) {
			throw new UsageError("Trying to set out-of-bounds cell.");
		}

		this.setCellCore(row, col, value);
	}

	public setCells(
		rowStart: number,
		colStart: number,
		colCount: number,
		values: readonly MatrixItem<T>[],
	): void {
		const rowCount = Math.ceil(values.length / colCount);

		assert(
			0 <= rowStart &&
				rowStart < this.rowCount &&
				0 <= colStart &&
				colStart < this.colCount &&
				1 <= colCount &&
				colCount <= this.colCount - colStart &&
				rowCount <= this.rowCount - rowStart,
			0x01b /* "Trying to set multiple out-of-bounds cells!" */,
		);

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
	}

	private setCellCore(
		row: number,
		col: number,
		value: MatrixItem<T>,
		rowHandle = this.rows.getAllocatedHandle(row),
		colHandle = this.cols.getAllocatedHandle(col),
	): void {
		this.protectAgainstReentrancy(() => {
			if (this.undo !== undefined) {
				let oldValue = this.cells.getCell(rowHandle, colHandle);
				if (oldValue === null) {
					oldValue = undefined;
				}

				this.undo.cellSet(rowHandle, colHandle, oldValue);
			}

			this.cells.setCell(rowHandle, colHandle, value);

			if (this.isAttached()) {
				this.sendSetCellOp(row, col, value, rowHandle, colHandle);
			}

			// Avoid reentrancy by raising change notifications after the op is queued.
			for (const consumer of this.consumers.values()) {
				consumer.cellsChanged(row, col, 1, 1, this);
			}
		});
	}

	private createOpMetadataLocalRef(
		vector: PermutationVector,
		pos: number,
		localSeq: number,
	): LocalReferencePosition {
		const segoff = vector.getContainingSegment(pos, undefined, localSeq);
		assert(
			segoff.segment !== undefined && segoff.offset !== undefined,
			0x8b3 /* expected valid position */,
		);
		return vector.createLocalReferencePosition(
			segoff.segment,
			segoff.offset,
			ReferenceType.StayOnRemove,
			undefined,
		);
	}

	private sendSetCellOp(
		row: number,
		col: number,
		value: MatrixItem<T>,
		rowHandle: Handle,
		colHandle: Handle,
		localSeq = this.nextLocalSeq(),
	): void {
		assert(
			this.isAttached(),
			0x1e2 /* "Caller must ensure 'isAttached()' before calling 'sendSetCellOp'." */,
		);

		const op: ISetOp<T> = {
			type: MatrixOp.set,
			row,
			col,
			value,
			fwwMode:
				this.userSwitchedSetCellPolicy || this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1,
		};

		const rowsRef = this.createOpMetadataLocalRef(this.rows, row, localSeq);
		const colsRef = this.createOpMetadataLocalRef(this.cols, col, localSeq);
		const metadata: ISetOpMetadata = {
			rowHandle,
			colHandle,
			localSeq,
			rowsRef,
			colsRef,
			referenceSeqNumber: this.deltaManager.lastSequenceNumber,
		};

		this.submitLocalMessage(op, metadata);
		this.pending.setCell(rowHandle, colHandle, localSeq);
	}

	/**
	 * This makes sure that the code inside the callback is not reentrant. We need to do that because we raise notifications
	 * to the consumers telling about these changes and they can try to change the matrix while listening to those notifications
	 * which can make the shared matrix to be in bad state. For example, we are raising notification for a setCell changes and
	 * a consumer tries to delete that row/col on receiving that notification which can lead to this matrix trying to setCell in
	 * a deleted row/col.
	 * @param callback - code that needs to protected against reentrancy.
	 */
	private protectAgainstReentrancy(callback: () => void): void {
		if (this.reentrantCount !== 0) {
			// Validate that applications don't submit edits in response to matrix change notifications. This is unsupported.
			throw new UsageError("Reentrancy detected in SharedMatrix.");
		}
		this.reentrantCount++;
		try {
			callback();
		} finally {
			this.reentrantCount--;
		}
		assert(
			this.reentrantCount === 0,
			0x85e /* indicates a problem with the reentrancy tracking code. */,
		);
	}

	private submitVectorMessage(
		currentVector: PermutationVector,
		oppositeVector: PermutationVector,
		target: SnapshotPath.rows | SnapshotPath.cols,
		message: IMergeTreeOp,
	): void {
		// Ideally, we would have a single 'localSeq' counter that is shared between both PermutationVectors
		// and the SharedMatrix's cell data.  Instead, we externally advance each MergeTree's 'localSeq' counter
		// for each submitted op it not aware of to keep them synchronized.
		const localSeq = currentVector.getCollabWindow().localSeq;
		const oppositeWindow = oppositeVector.getCollabWindow();

		// Note that the comparison is '>=' because, in the case the MergeTree is regenerating ops for reconnection,
		// the MergeTree submits the op with the original 'localSeq'.
		assert(
			localSeq >= oppositeWindow.localSeq,
			0x01c /* "The 'localSeq' of the vector submitting an op must >= the 'localSeq' of the other vector." */,
		);

		oppositeWindow.localSeq = localSeq;

		// If the SharedMatrix is local, it's state will be submitted via a Snapshot when initially connected.
		// Do not queue a message or track the pending op, as there will never be an ACK, etc.
		if (this.isAttached()) {
			// Record whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
			const targetedMessage: VectorOp = { ...message, target };

			this.submitLocalMessage(
				targetedMessage,
				currentVector.peekPendingSegmentGroups(
					message.type === MergeTreeDeltaType.GROUP ? message.ops.length : 1,
				),
			);
		}
	}

	private submitColMessage(message: IMergeTreeOp): void {
		this.submitVectorMessage(this.cols, this.rows, SnapshotPath.cols, message);
	}

	public insertCols(colStart: number, count: number): void {
		if (count === 0) {
			return;
		}
		if (colStart > this.colCount) {
			throw new UsageError("insertCols: out of bounds");
		}
		this.protectAgainstReentrancy(() => {
			const message = this.cols.insert(colStart, count);
			assert(message !== undefined, 0x8b4 /* must be defined */);
			this.submitColMessage(message);
		});
	}

	public removeCols(colStart: number, count: number): void {
		if (count === 0) {
			return;
		}
		if (colStart > this.colCount) {
			throw new UsageError("removeCols: out of bounds");
		}
		this.protectAgainstReentrancy(() =>
			this.submitColMessage(this.cols.remove(colStart, count)),
		);
	}

	private submitRowMessage(message: IMergeTreeOp): void {
		this.submitVectorMessage(this.rows, this.cols, SnapshotPath.rows, message);
	}

	public insertRows(rowStart: number, count: number): void {
		if (count === 0) {
			return;
		}
		if (rowStart > this.rowCount) {
			throw new UsageError("insertRows: out of bounds");
		}
		this.protectAgainstReentrancy(() => {
			const message = this.rows.insert(rowStart, count);
			assert(message !== undefined, 0x8b5 /* must be defined */);
			this.submitRowMessage(message);
		});
	}

	public removeRows(rowStart: number, count: number): void {
		if (count === 0) {
			return;
		}
		if (rowStart > this.rowCount) {
			throw new UsageError("removeRows: out of bounds");
		}
		this.protectAgainstReentrancy(() =>
			this.submitRowMessage(this.rows.remove(rowStart, count)),
		);
	}

	public _undoRemoveRows(rowStart: number, spec: IJSONSegment): void {
		const { op, inserted } = reinsertSegmentIntoVector(this.rows, rowStart, spec);
		assert(op !== undefined, 0x8b6 /* must be defined */);
		this.submitRowMessage(op);

		// Generate setCell ops for each populated cell in the reinserted rows.
		let rowHandle = inserted.start;
		const rowCount = inserted.cachedLength;
		for (let row = rowStart; row < rowStart + rowCount; row++, rowHandle++) {
			for (let col = 0; col < this.colCount; col++) {
				const colHandle = this.colHandles.getHandle(col);
				const value = this.cells.getCell(rowHandle, colHandle);
				if (this.isAttached() && value !== undefined && value !== null) {
					this.sendSetCellOp(row, col, value, rowHandle, colHandle);
				}
			}
		}

		// Avoid reentrancy by raising change notifications after the op is queued.
		for (const consumer of this.consumers.values()) {
			consumer.cellsChanged(rowStart, /* colStart: */ 0, rowCount, this.colCount, this);
		}
	}

	/***/ public _undoRemoveCols(colStart: number, spec: IJSONSegment): void {
		const { op, inserted } = reinsertSegmentIntoVector(this.cols, colStart, spec);
		assert(op !== undefined, 0x8b7 /* must be defined */);
		this.submitColMessage(op);

		// Generate setCell ops for each populated cell in the reinserted cols.
		let colHandle = inserted.start;
		const colCount = inserted.cachedLength;
		for (let col = colStart; col < colStart + colCount; col++, colHandle++) {
			for (let row = 0; row < this.rowCount; row++) {
				const rowHandle = this.rowHandles.getHandle(row);
				const value = this.cells.getCell(rowHandle, colHandle);
				if (this.isAttached() && value !== undefined && value !== null) {
					this.sendSetCellOp(row, col, value, rowHandle, colHandle);
				}
			}
		}

		// Avoid reentrancy by raising change notifications after the op is queued.
		for (const consumer of this.consumers.values()) {
			consumer.cellsChanged(/* rowStart: */ 0, colStart, this.rowCount, colCount, this);
		}
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();
		builder.addWithStats(
			SnapshotPath.rows,
			this.rows.summarize(this.runtime, this.handle, serializer),
		);
		builder.addWithStats(
			SnapshotPath.cols,
			this.cols.summarize(this.runtime, this.handle, serializer),
		);
		const artifactsToSummarize = [
			this.cells.snapshot(),
			this.pending.snapshot(),
			this.setCellLwwToFwwPolicySwitchOpSeqNumber,
		];

		// Only need to store it in the snapshot if we have switched the policy already.
		if (this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1) {
			artifactsToSummarize.push(this.cellLastWriteTracker.snapshot());
		}
		builder.addBlob(
			SnapshotPath.cells,
			serializer.stringify(artifactsToSummarize, this.handle),
		);
		return builder.getSummaryTree();
	}

	/**
	 * Runs serializer on the GC data for this SharedMatrix.
	 * All the IFluidHandle's stored in the cells represent routes to other objects.
	 */
	protected processGCDataCore(serializer: IFluidSerializer): void {
		for (let row = 0; row < this.rowCount; row++) {
			for (let col = 0; col < this.colCount; col++) {
				serializer.stringify(this.getCell(row, col), this.handle);
			}
		}
	}

	/**
	 * Advances the 'localSeq' counter for the cell data operation currently being queued.
	 *
	 * Do not use with 'submitColMessage()/submitRowMessage()' as these helpers + the MergeTree will
	 * automatically advance 'localSeq'.
	 */
	private nextLocalSeq(): number {
		// Ideally, we would have a single 'localSeq' counter that is shared between both PermutationVectors
		// and the SharedMatrix's cell data.  Instead, we externally bump each MergeTree's 'localSeq' counter
		// for SharedMatrix ops it's not aware of to keep them synchronized.  (For cell data operations, we
		// need to bump both counters.)

		this.cols.getCollabWindow().localSeq++;
		return ++this.rows.getCollabWindow().localSeq;
	}

	protected submitLocalMessage(message: unknown, localOpMetadata?: unknown): void {
		// TODO: Recommend moving this assertion into SharedObject
		//       (See https://github.com/microsoft/FluidFramework/issues/2559)
		assert(
			this.isAttached() === true,
			0x01d /* "Trying to submit message to runtime while detached!" */,
		);

		this.inFlightRefSeqs.push(this.deltaManager.lastSequenceNumber);
		super.submitLocalMessage(message, localOpMetadata);

		// Ensure that row/col 'localSeq' are synchronized (see 'nextLocalSeq()').
		assert(
			this.rows.getCollabWindow().localSeq === this.cols.getCollabWindow().localSeq,
			0x01e /* "Row and col collab window 'localSeq' desynchronized!" */,
		);
	}

	protected didAttach(): void {
		// We've attached we need to start generating and sending ops.
		// so start collaboration and provide a default client id incase we are not connected
		if (this.isAttached()) {
			this.rows.startOrUpdateCollaboration(this.runtime.clientId ?? "attached");
			this.cols.startOrUpdateCollaboration(this.runtime.clientId ?? "attached");
		}
	}

	protected onConnect(): void {
		assert(
			this.rows.getCollabWindow().collaborating === this.cols.getCollabWindow().collaborating,
			0x01f /* "Row and col collab window 'collaborating' status desynchronized!" */,
		);

		// Update merge tree collaboration information with new client ID and then resend pending ops
		this.rows.startOrUpdateCollaboration(this.runtime.clientId as string);
		this.cols.startOrUpdateCollaboration(this.runtime.clientId as string);
	}

	private rebasePosition(
		// eslint-disable-next-line import/no-deprecated
		client: Client,
		ref: LocalReferencePosition,
		localSeq: number,
	): number | undefined {
		const segment: ISegmentInternal | undefined = ref.getSegment();
		const offset = ref.getOffset();
		// If the segment that contains the position is removed, then this setCell op should do nothing.
		if (segment === undefined || offset === undefined || segment.removedSeq !== undefined) {
			return;
		}

		assert(
			segment.localRemovedSeq === undefined ||
				(segment.localRemovedSeq !== undefined && segment.localRemovedSeq > localSeq),
			0x8b8 /* Attempted to set a cell which was removed locally before the original op applied. */,
		);

		return client.findReconnectionPosition(segment, localSeq) + offset;
	}

	protected reSubmitCore(incoming: unknown, localOpMetadata: unknown): void {
		const originalRefSeq = this.inFlightRefSeqs.shift();
		assert(
			originalRefSeq !== undefined,
			0x8b9 /* Expected a recorded refSeq when resubmitting an op */,
		);
		const content = incoming as MatrixSetOrVectorOp<T>;

		if (content.type === MatrixOp.set && content.target === undefined) {
			const setOp = content;
			const { rowHandle, colHandle, localSeq, rowsRef, colsRef, referenceSeqNumber } =
				localOpMetadata as ISetOpMetadata;

			// If after rebasing the op, we get a valid row/col number, that means the row/col
			// handles have not been recycled and we can safely use them.
			const row = this.rebasePosition(this.rows, rowsRef, localSeq);
			const col = this.rebasePosition(this.cols, colsRef, localSeq);
			this.rows.removeLocalReferencePosition(rowsRef);
			this.cols.removeLocalReferencePosition(colsRef);
			if (row !== undefined && col !== undefined && row >= 0 && col >= 0) {
				const lastCellModificationDetails = this.cellLastWriteTracker.getCell(
					rowHandle,
					colHandle,
				);
				// If the mode is LWW, then send the op.
				// Otherwise if the current mode is FWW and if we generated this op, after seeing the
				// last set op, or it is the first set op for the cell, then regenerate the op,
				// otherwise raise conflict. We want to check the current mode here and not that
				// whether op was made in FWW or not.
				if (
					this.setCellLwwToFwwPolicySwitchOpSeqNumber === -1 ||
					lastCellModificationDetails === undefined ||
					referenceSeqNumber >= lastCellModificationDetails.seqNum
				) {
					this.sendSetCellOp(row, col, setOp.value, rowHandle, colHandle, localSeq);
				} else if (this.pending.getCell(rowHandle, colHandle) !== undefined) {
					// Clear the pending changes if any as we are not sending the op.
					this.pending.setCell(rowHandle, colHandle, undefined);
				}
			}
		} else {
			switch (content.target) {
				case SnapshotPath.cols: {
					this.submitColMessage(
						this.cols.regeneratePendingOp(
							content,
							// eslint-disable-next-line import/no-deprecated
							localOpMetadata as SegmentGroup | SegmentGroup[],
						),
					);
					break;
				}
				case SnapshotPath.rows: {
					this.submitRowMessage(
						this.rows.regeneratePendingOp(
							content,
							// eslint-disable-next-line import/no-deprecated
							localOpMetadata as SegmentGroup | SegmentGroup[],
						),
					);
					break;
				}
				default: {
					unreachableCase(content);
				}
			}
		}
	}

	protected onDisconnect(): void {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		try {
			await this.rows.load(
				this.runtime,
				new ObjectStoragePartition(storage, SnapshotPath.rows),
				this.serializer,
			);
			await this.cols.load(
				this.runtime,
				new ObjectStoragePartition(storage, SnapshotPath.cols),
				this.serializer,
			);
			const [
				cellData,
				_pendingCliSeqData,
				setCellLwwToFwwPolicySwitchOpSeqNumber,
				cellLastWriteTracker,
				// Cast is needed since the (de)serializer returns content of type `any`.
			] = (await deserializeBlob(storage, SnapshotPath.cells, this.serializer)) as [
				RecurArray<MatrixItem<T>>,
				unknown,
				number,
				RecurArray<CellLastWriteTrackerItem>,
			];

			this.cells = SparseArray2D.load(cellData);
			this.setCellLwwToFwwPolicySwitchOpSeqNumber =
				setCellLwwToFwwPolicySwitchOpSeqNumber ?? -1;
			if (cellLastWriteTracker !== undefined) {
				this.cellLastWriteTracker = SparseArray2D.load(cellLastWriteTracker);
			}
		} catch (error) {
			this.logger.sendErrorEvent({ eventName: "MatrixLoadFailed" }, error);
		}
	}

	/**
	 * Tells whether the setCell op should be applied or not based on First Write Win policy. It assumes
	 * we are in FWW mode.
	 */
	private shouldSetCellBasedOnFWW(
		rowHandle: Handle,
		colHandle: Handle,
		message: ISequencedDocumentMessage,
	): boolean {
		assert(
			this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1,
			0x85f /* should be in Fww mode when calling this method */,
		);
		assert(message.clientId !== null, 0x860 /* clientId should not be null */);
		const lastCellModificationDetails = this.cellLastWriteTracker.getCell(
			rowHandle,
			colHandle,
		);
		// If someone tried to Overwrite the cell value or first write on this cell or
		// same client tried to modify the cell.
		return (
			lastCellModificationDetails === undefined ||
			lastCellModificationDetails.clientId === message.clientId ||
			message.referenceSequenceNumber >= lastCellModificationDetails.seqNum
		);
	}

	protected processCore(
		msg: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		if (local) {
			const recordedRefSeq = this.inFlightRefSeqs.shift();
			assert(recordedRefSeq !== undefined, 0x8ba /* No pending recorded refSeq found */);
			// TODO: AB#7076: Some equivalent assert should be enabled. This fails some e2e stashed op tests because
			// the deltaManager may have seen more messages than the runtime has processed while amidst the stashed op
			// flow, so e.g. when `applyStashedOp` is called and the DDS is put in a state where it expects an ack for
			// one of its messages, the delta manager has actually already seen subsequent messages from collaborators
			// which the in-flight message is concurrent to.
			// See "handles stashed ops created on top of sequenced local ops" for one such test case.
			// assert(recordedRefSeq <= message.referenceSequenceNumber, "RefSeq mismatch");
		}

		const contents = msg.contents as MatrixSetOrVectorOp<T>;
		const target = contents.target;

		switch (target) {
			case SnapshotPath.cols: {
				this.cols.applyMsg(msg, local);
				break;
			}
			case SnapshotPath.rows: {
				this.rows.applyMsg(msg, local);
				break;
			}
			case undefined: {
				assert(
					contents.type === MatrixOp.set,
					0x021 /* "SharedMatrix message contents have unexpected type!" */,
				);

				const { row, col, value, fwwMode } = contents;
				const isPreviousSetCellPolicyModeFWW =
					this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1;
				// If this is the first op notifying us of the policy change, then set the policy change seq number.
				if (this.setCellLwwToFwwPolicySwitchOpSeqNumber === -1 && fwwMode === true) {
					this.setCellLwwToFwwPolicySwitchOpSeqNumber = msg.sequenceNumber;
				}

				assert(msg.clientId !== null, 0x861 /* clientId should not be null!! */);
				if (local) {
					// We are receiving the ACK for a local pending set operation.
					const { rowHandle, colHandle, localSeq, rowsRef, colsRef } =
						localOpMetadata as ISetOpMetadata;
					const isLatestPendingOp = this.isLatestPendingWrite(rowHandle, colHandle, localSeq);
					this.rows.removeLocalReferencePosition(rowsRef);
					this.cols.removeLocalReferencePosition(colsRef);
					// If policy is switched and cell should be modified too based on policy, then update the tracker.
					// If policy is not switched, then also update the tracker in case it is the latest.
					if (
						(this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1 &&
							this.shouldSetCellBasedOnFWW(rowHandle, colHandle, msg)) ||
						(this.setCellLwwToFwwPolicySwitchOpSeqNumber === -1 && isLatestPendingOp)
					) {
						this.cellLastWriteTracker.setCell(rowHandle, colHandle, {
							seqNum: msg.sequenceNumber,
							clientId: msg.clientId,
						});
					}

					if (isLatestPendingOp) {
						this.pending.setCell(rowHandle, colHandle, undefined);
					}
				} else {
					const adjustedRow = this.rows.adjustPosition(row, msg);
					if (adjustedRow !== undefined) {
						const adjustedCol = this.cols.adjustPosition(col, msg);

						if (adjustedCol !== undefined) {
							const rowHandle = this.rows.getAllocatedHandle(adjustedRow);
							const colHandle = this.cols.getAllocatedHandle(adjustedCol);

							assert(
								isHandleValid(rowHandle) && isHandleValid(colHandle),
								0x022 /* "SharedMatrix row and/or col handles are invalid!" */,
							);
							if (this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1) {
								// If someone tried to Overwrite the cell value or first write on this cell or
								// same client tried to modify the cell or if the previous mode was LWW, then we need to still
								// overwrite the cell and raise conflict if we have pending changes as our change is going to be lost.
								if (
									!isPreviousSetCellPolicyModeFWW ||
									this.shouldSetCellBasedOnFWW(rowHandle, colHandle, msg)
								) {
									const previousValue = this.cells.getCell(rowHandle, colHandle);
									this.cells.setCell(rowHandle, colHandle, value);
									this.cellLastWriteTracker.setCell(rowHandle, colHandle, {
										seqNum: msg.sequenceNumber,
										clientId: msg.clientId,
									});
									for (const consumer of this.consumers.values()) {
										consumer.cellsChanged(adjustedRow, adjustedCol, 1, 1, this);
									}
									// Check is there are any pending changes, which will be rejected. If so raise conflict.
									if (this.pending.getCell(rowHandle, colHandle) !== undefined) {
										// Don't reset the pending value yet, as there maybe more fww op from same client, so we want
										// to raise conflict event for that op also.
										this.emit(
											"conflict",
											row,
											col,
											value, // Current value
											previousValue, // Ignored local value
											this,
										);
									}
								}
							} else if (this.pending.getCell(rowHandle, colHandle) === undefined) {
								// If there is a pending (unACKed) local write to the same cell, skip the current op
								// since it "happened before" the pending write.
								this.cells.setCell(rowHandle, colHandle, value);
								this.cellLastWriteTracker.setCell(rowHandle, colHandle, {
									seqNum: msg.sequenceNumber,
									clientId: msg.clientId,
								});
								for (const consumer of this.consumers.values()) {
									consumer.cellsChanged(adjustedRow, adjustedCol, 1, 1, this);
								}
							}
						}
					}
				}
				break;
			}
			default: {
				unreachableCase(target, "unknown target");
			}
		}
	}

	// Invoked by PermutationVector to notify IMatrixConsumers of row insertion/deletions.
	private readonly onRowDelta = (
		position: number,
		removedCount: number,
		insertedCount: number,
	): void => {
		for (const consumer of this.consumers) {
			consumer.rowsChanged(position, removedCount, insertedCount, this);
		}
	};

	// Invoked by PermutationVector to notify IMatrixConsumers of col insertion/deletions.
	private readonly onColDelta = (
		position: number,
		removedCount: number,
		insertedCount: number,
	): void => {
		for (const consumer of this.consumers) {
			consumer.colsChanged(position, removedCount, insertedCount, this);
		}
	};

	private readonly onRowHandlesRecycled = (rowHandles: Handle[]): void => {
		for (const rowHandle of rowHandles) {
			this.cells.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
			this.pending.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
			this.cellLastWriteTracker.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
		}
	};

	private readonly onColHandlesRecycled = (colHandles: Handle[]): void => {
		for (const colHandle of colHandles) {
			this.cells.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
			this.pending.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
			this.cellLastWriteTracker.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
		}
	};

	public switchSetCellPolicy(): void {
		if (this.setCellLwwToFwwPolicySwitchOpSeqNumber === -1) {
			if (this.isAttached()) {
				this.userSwitchedSetCellPolicy = true;
			} else {
				this.setCellLwwToFwwPolicySwitchOpSeqNumber = 0;
			}
		}
	}

	/**
	 * Returns true if the latest pending write to the cell indicated by the given row/col handles
	 * matches the given 'localSeq'.
	 *
	 * A return value of `true` indicates that there are no later local operations queued that will
	 * clobber the write op at the given 'localSeq'.  This includes later ops that overwrite the cell
	 * with a different value as well as row/col removals that might recycled the given row/col handles.
	 */
	private isLatestPendingWrite(
		rowHandle: Handle,
		colHandle: Handle,
		localSeq: number,
	): boolean {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const pendingLocalSeq = this.pending.getCell(rowHandle, colHandle)!;

		// Note while we're awaiting the ACK for a local set, it's possible for the row/col to be
		// locally removed and the row/col handles recycled.  If this happens, the pendingLocalSeq will
		// be 'undefined' or > 'localSeq'.
		assert(
			!(pendingLocalSeq < localSeq),
			0x023 /* "The 'localSeq' of pending write (if any) must be <= the localSeq of the currently processed op." */,
		);

		// If this is the most recent write to the cell by the local client, the stored localSeq
		// will be an exact match for the given 'localSeq'.
		return pendingLocalSeq === localSeq;
	}

	public toString(): string {
		let s = `client:${
			this.runtime.clientId
		}\nrows: ${this.rows.toString()}\ncols: ${this.cols.toString()}\n\n`;

		for (let r = 0; r < this.rowCount; r++) {
			s += `  [`;
			for (let c = 0; c < this.colCount; c++) {
				if (c > 0) {
					s += ", ";
				}

				s += `${this.serializer.stringify(this.getCell(r, c), this.handle)}`;
			}
			s += "]\n";
		}

		return `${s}\n`;
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 */
	protected applyStashedOp(_content: unknown): void {
		const content = _content as MatrixSetOrVectorOp<T>;
		if (content.type === MatrixOp.set && content.target === undefined) {
			if (content.fwwMode === true) {
				this.switchSetCellPolicy();
			}
			this.setCell(content.row, content.col, content.value);
		} else {
			const vector = content.target === SnapshotPath.cols ? this.cols : this.rows;
			vector.applyStashedOp(content);
			if (content.target === SnapshotPath.cols) {
				this.submitColMessage(content);
			} else {
				this.submitRowMessage(content);
			}
		}
	}
}
