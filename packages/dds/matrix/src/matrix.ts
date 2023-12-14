/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IEventThisPlaceHolder } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
	Serializable,
	IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import {
	IFluidSerializer,
	ISharedObjectEvents,
	makeHandlesSerializable,
	parseHandles,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { ObjectStoragePartition, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IMatrixProducer, IMatrixConsumer, IMatrixReader, IMatrixWriter } from "@tiny-calc/nano";
import {
	MergeTreeDeltaType,
	IMergeTreeOp,
	SegmentGroup,
	// eslint-disable-next-line import/no-deprecated
	Client,
	IJSONSegment,
} from "@fluidframework/merge-tree";
import { MatrixOp } from "./ops";
import { PermutationVector, reinsertSegmentIntoVector } from "./permutationvector";
import { SparseArray2D } from "./sparsearray2d";
import { SharedMatrixFactory } from "./runtime";
import { Handle, isHandleValid } from "./handletable";
import { deserializeBlob } from "./serialization";
import { ensureRange } from "./range";
import { IUndoConsumer } from "./types";
import { MatrixUndoProvider } from "./undoprovider";

const enum SnapshotPath {
	rows = "rows",
	cols = "cols",
	cells = "cells",
}

interface ISetOp<T> {
	type: MatrixOp.set;
	row: number;
	col: number;
	value: MatrixItem<T>;
	fwwMode?: boolean;
}

interface ISetOpMetadata {
	rowHandle: Handle;
	colHandle: Handle;
	localSeq: number;
	rowsRefSeq: number;
	colsRefSeq: number;
	referenceSeqNumber: number;
}

/**
 * Events emitted by Shared Matrix.
 * @alpha
 */
export interface ISharedMatrixEvents<T> extends ISharedObjectEvents {
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
	 * - `target` - The {@link SharedMatrix} itself.
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
 * A matrix cell value may be undefined (indicating an empty cell) or any serializable type,
 * excluding null.  (However, nulls may be embedded inside objects and arrays.)
 * @alpha
 */
// eslint-disable-next-line @rushstack/no-new-null -- Using 'null' to disallow 'null'.
export type MatrixItem<T> = Serializable<Exclude<T, null>> | undefined;

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
 * @alpha
 */
export class SharedMatrix<T = any>
	extends SharedObject<ISharedMatrixEvents<T>>
	implements
		IMatrixProducer<MatrixItem<T>>,
		IMatrixReader<MatrixItem<T>>,
		IMatrixWriter<MatrixItem<T>>
{
	private readonly consumers = new Set<IMatrixConsumer<MatrixItem<T>>>();

	public static getFactory() {
		return new SharedMatrixFactory();
	}

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
		_isSetCellConflictResolutionPolicyFWW?: boolean,
	) {
		super(id, runtime, attributes, "fluid_matrix_");

		this.setCellLwwToFwwPolicySwitchOpSeqNumber =
			_isSetCellConflictResolutionPolicyFWW === true ? 0 : -1;
		this.rows = new PermutationVector(
			SnapshotPath.rows,
			this.logger,
			runtime,
			this.onRowDelta,
			this.onRowHandlesRecycled,
		);

		this.cols = new PermutationVector(
			SnapshotPath.cols,
			this.logger,
			runtime,
			this.onColDelta,
			this.onColHandlesRecycled,
		);
	}

	private undo?: MatrixUndoProvider<T>;

	/**
	 * Subscribes the given IUndoConsumer to the matrix.
	 */
	public openUndo(consumer: IUndoConsumer) {
		assert(
			this.undo === undefined,
			0x019 /* "SharedMatrix.openUndo() supports at most a single IUndoConsumer." */,
		);

		this.undo = new MatrixUndoProvider(consumer, this, this.rows, this.cols);
	}

	// TODO: closeUndo()?

	private get rowHandles() {
		return this.rows.handleCache;
	}
	private get colHandles() {
		return this.cols.handleCache;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public static create<T>(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(id, SharedMatrixFactory.Type) as SharedMatrix<T>;
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

	public get rowCount() {
		return this.rows.getLength();
	}
	public get colCount() {
		return this.cols.getLength();
	}

	public isSetCellConflictResolutionPolicyFWW() {
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

	public setCell(row: number, col: number, value: MatrixItem<T>) {
		assert(
			0 <= row && row < this.rowCount && 0 <= col && col < this.colCount,
			0x01a /* "Trying to set out-of-bounds cell!" */,
		);

		this.setCellCore(row, col, value);
	}

	public setCells(
		rowStart: number,
		colStart: number,
		colCount: number,
		values: readonly MatrixItem<T>[],
	) {
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
	) {
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

	private sendSetCellOp(
		row: number,
		col: number,
		value: MatrixItem<T>,
		rowHandle: Handle,
		colHandle: Handle,
		localSeq = this.nextLocalSeq(),
		rowsRefSeq = this.rows.getCollabWindow().currentSeq,
		colsRefSeq = this.cols.getCollabWindow().currentSeq,
	) {
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

		const metadata: ISetOpMetadata = {
			rowHandle,
			colHandle,
			localSeq,
			rowsRefSeq,
			colsRefSeq,
			referenceSeqNumber: this.runtime.deltaManager.lastSequenceNumber,
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
	private protectAgainstReentrancy(callback: () => void) {
		assert(this.reentrantCount === 0, 0x85d /* reentrant code */);
		this.reentrantCount++;
		callback();
		this.reentrantCount--;
		assert(this.reentrantCount === 0, 0x85e /* reentrant code on exit */);
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
		assert(
			localSeq >= oppositeWindow.localSeq,
			0x01c /* "The 'localSeq' of the vector submitting an op must >= the 'localSeq' of the other vector." */,
		);

		oppositeWindow.localSeq = localSeq;

		// If the SharedMatrix is local, it's state will be submitted via a Snapshot when initially connected.
		// Do not queue a message or track the pending op, as there will never be an ACK, etc.
		if (this.isAttached()) {
			// Record whether this `op` targets rows or cols.  (See dispatch in `processCore()`)
			message.target = dimension;

			this.submitLocalMessage(
				message,
				currentVector.peekPendingSegmentGroups(
					message.type === MergeTreeDeltaType.GROUP ? message.ops.length : 1,
				),
			);
		}
	}

	private submitColMessage(message: any) {
		this.submitVectorMessage(this.cols, this.rows, SnapshotPath.cols, message);
	}

	public insertCols(colStart: number, count: number) {
		this.protectAgainstReentrancy(() =>
			this.submitColMessage(this.cols.insert(colStart, count)),
		);
	}

	public removeCols(colStart: number, count: number) {
		this.protectAgainstReentrancy(() =>
			this.submitColMessage(this.cols.remove(colStart, count)),
		);
	}

	private submitRowMessage(message: any) {
		this.submitVectorMessage(this.rows, this.cols, SnapshotPath.rows, message);
	}

	public insertRows(rowStart: number, count: number) {
		this.protectAgainstReentrancy(() =>
			this.submitRowMessage(this.rows.insert(rowStart, count)),
		);
	}

	public removeRows(rowStart: number, count: number) {
		this.protectAgainstReentrancy(() =>
			this.submitRowMessage(this.rows.remove(rowStart, count)),
		);
	}

	/***/ public _undoRemoveRows(rowStart: number, spec: IJSONSegment) {
		const { op, inserted } = reinsertSegmentIntoVector(this.rows, rowStart, spec);
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

	/***/ public _undoRemoveCols(colStart: number, spec: IJSONSegment) {
		const { op, inserted } = reinsertSegmentIntoVector(this.cols, colStart, spec);
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
	protected processGCDataCore(serializer: IFluidSerializer) {
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
		assert(
			this.isAttached() === true,
			0x01d /* "Trying to submit message to runtime while detached!" */,
		);

		super.submitLocalMessage(
			makeHandlesSerializable(message, this.serializer, this.handle),
			localOpMetadata,
		);

		// Ensure that row/col 'localSeq' are synchronized (see 'nextLocalSeq()').
		assert(
			this.rows.getCollabWindow().localSeq === this.cols.getCollabWindow().localSeq,
			0x01e /* "Row and col collab window 'localSeq' desynchronized!" */,
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
		pos: number,
		referenceSequenceNumber: number,
		localSeq: number,
	): number | undefined {
		const { clientId } = client.getCollabWindow();
		const { segment, offset } = client.getContainingSegment(
			pos,
			{ referenceSequenceNumber, clientId: client.getLongClientId(clientId) },
			localSeq,
		);
		if (segment === undefined || offset === undefined) {
			return;
		}

		return client.findReconnectionPosition(segment, localSeq) + offset;
	}

	protected reSubmitCore(content: any, localOpMetadata: unknown) {
		switch (content.target) {
			case SnapshotPath.cols:
				this.submitColMessage(
					this.cols.regeneratePendingOp(
						content as IMergeTreeOp,
						localOpMetadata as SegmentGroup | SegmentGroup[],
					),
				);
				break;
			case SnapshotPath.rows:
				this.submitRowMessage(
					this.rows.regeneratePendingOp(
						content as IMergeTreeOp,
						localOpMetadata as SegmentGroup | SegmentGroup[],
					),
				);
				break;
			default: {
				assert(
					content.type === MatrixOp.set,
					0x020 /* "Unknown SharedMatrix 'op' type." */,
				);

				const setOp = content as ISetOp<T>;
				const {
					rowHandle,
					colHandle,
					localSeq,
					rowsRefSeq,
					colsRefSeq,
					referenceSeqNumber,
				} = localOpMetadata as ISetOpMetadata;

				// If after rebasing the op, we get a valid row/col number, that means the row/col
				// handles have not been recycled and we can safely use them.
				const row = this.rebasePosition(this.rows, setOp.row, rowsRefSeq, localSeq);
				const col = this.rebasePosition(this.cols, setOp.col, colsRefSeq, localSeq);
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
						this.sendSetCellOp(
							row,
							col,
							setOp.value,
							rowHandle,
							colHandle,
							localSeq,
							rowsRefSeq,
							colsRefSeq,
						);
					} else if (this.pending.getCell(rowHandle, colHandle) !== undefined) {
						// Clear the pending changes if any as we are not sending the op.
						this.pending.setCell(rowHandle, colHandle, undefined);
					}
				}
				break;
			}
		}
	}

	protected onDisconnect() {}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService) {
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
			] = await deserializeBlob(storage, SnapshotPath.cells, this.serializer);

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
	) {
		assert(
			this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1,
			0x85f /* should be in Fww mode when calling this method */,
		);
		assert(message.clientId !== null, 0x860 /* clientId should not be null */);
		const lastCellModificationDetails = this.cellLastWriteTracker.getCell(rowHandle, colHandle);
		// If someone tried to Overwrite the cell value or first write on this cell or
		// same client tried to modify the cell.
		return (
			lastCellModificationDetails === undefined ||
			lastCellModificationDetails.clientId === message.clientId ||
			message.referenceSequenceNumber >= lastCellModificationDetails.seqNum
		);
	}

	protected processCore(
		rawMessage: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		const msg = parseHandles(rawMessage, this.serializer);

		const contents = msg.contents;

		switch (contents.target) {
			case SnapshotPath.cols:
				this.cols.applyMsg(msg, local);
				break;
			case SnapshotPath.rows:
				this.rows.applyMsg(msg, local);
				break;
			default: {
				assert(
					contents.type === MatrixOp.set,
					0x021 /* "SharedMatrix message contents have unexpected type!" */,
				);

				const { row, col, value, fwwMode } = contents;
				const isPreviousSetCellPolicyModeFWW =
					this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1;
				// If this is the first op notifying us of the policy change, then set the policy change seq number.
				if (this.setCellLwwToFwwPolicySwitchOpSeqNumber === -1 && fwwMode === true) {
					this.setCellLwwToFwwPolicySwitchOpSeqNumber = rawMessage.sequenceNumber;
				}

				assert(rawMessage.clientId !== null, 0x861 /* clientId should not be null!! */);
				if (local) {
					// We are receiving the ACK for a local pending set operation.
					const { rowHandle, colHandle, localSeq } = localOpMetadata as ISetOpMetadata;
					const isLatestPendingOp = this.isLatestPendingWrite(
						rowHandle,
						colHandle,
						localSeq,
					);
					// If policy is switched and cell should be modified too based on policy, then update the tracker.
					// If policy is not switched, then also update the tracker in case it is the latest.
					if (
						(this.setCellLwwToFwwPolicySwitchOpSeqNumber > -1 &&
							this.shouldSetCellBasedOnFWW(rowHandle, colHandle, rawMessage)) ||
						(this.setCellLwwToFwwPolicySwitchOpSeqNumber === -1 && isLatestPendingOp)
					) {
						this.cellLastWriteTracker.setCell(rowHandle, colHandle, {
							seqNum: rawMessage.sequenceNumber,
							clientId: rawMessage.clientId,
						});
					}

					if (isLatestPendingOp) {
						this.pending.setCell(rowHandle, colHandle, undefined);
					}
				} else {
					const adjustedRow = this.rows.adjustPosition(row, rawMessage);
					if (adjustedRow !== undefined) {
						const adjustedCol = this.cols.adjustPosition(col, rawMessage);

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
									this.shouldSetCellBasedOnFWW(rowHandle, colHandle, rawMessage)
								) {
									const previousValue = this.cells.getCell(rowHandle, colHandle);
									this.cells.setCell(rowHandle, colHandle, value);
									this.cellLastWriteTracker.setCell(rowHandle, colHandle, {
										seqNum: rawMessage.sequenceNumber,
										clientId: rawMessage.clientId,
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
									seqNum: rawMessage.sequenceNumber,
									clientId: rawMessage.clientId,
								});
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

	// Invoked by PermutationVector to notify IMatrixConsumers of row insertion/deletions.
	private readonly onRowDelta = (
		position: number,
		removedCount: number,
		insertedCount: number,
	) => {
		for (const consumer of this.consumers) {
			consumer.rowsChanged(position, removedCount, insertedCount, this);
		}
	};

	// Invoked by PermutationVector to notify IMatrixConsumers of col insertion/deletions.
	private readonly onColDelta = (
		position: number,
		removedCount: number,
		insertedCount: number,
	) => {
		for (const consumer of this.consumers) {
			consumer.colsChanged(position, removedCount, insertedCount, this);
		}
	};

	private readonly onRowHandlesRecycled = (rowHandles: Handle[]) => {
		for (const rowHandle of rowHandles) {
			this.cells.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
			this.pending.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
			this.cellLastWriteTracker.clearRows(/* rowStart: */ rowHandle, /* rowCount: */ 1);
		}
	};

	private readonly onColHandlesRecycled = (colHandles: Handle[]) => {
		for (const colHandle of colHandles) {
			this.cells.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
			this.pending.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
			this.cellLastWriteTracker.clearCols(/* colStart: */ colHandle, /* colCount: */ 1);
		}
	};

	/**
	 * Api to switch Set Op policy from Last Writer Win to First Writer Win. It only switches from LWW to FWW
	 * and not from FWW to LWW. The next SetOp which is sent will communicate this policy to other clients.
	 */
	public switchSetCellPolicy() {
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
	private isLatestPendingWrite(rowHandle: Handle, colHandle: Handle, localSeq: number) {
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

	public toString() {
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
	protected applyStashedOp(content: any): unknown {
		const parsedContent = parseHandles(content, this.serializer);
		if (
			parsedContent.target === SnapshotPath.cols ||
			parsedContent.target === SnapshotPath.rows
		) {
			const op = parsedContent as IMergeTreeOp;
			const currentVector =
				parsedContent.target === SnapshotPath.cols ? this.cols : this.rows;
			const oppositeVector =
				parsedContent.target === SnapshotPath.cols ? this.rows : this.cols;
			const metadata = currentVector.applyStashedOp(op);
			const localSeq = currentVector.getCollabWindow().localSeq;
			const oppositeWindow = oppositeVector.getCollabWindow();

			assert(
				localSeq > oppositeWindow.localSeq,
				0x2d9,
				/* "The 'localSeq' of the vector applying stashed op must > the 'localSeq' of the other vector." */
			);

			oppositeWindow.localSeq = localSeq;

			return metadata;
		} else {
			assert(
				parsedContent.type === MatrixOp.set,
				0x2da /* "Unknown SharedMatrix 'op' type." */,
			);

			const setOp = parsedContent as ISetOp<T>;
			const rowHandle = this.rows.getAllocatedHandle(setOp.row);
			const colHandle = this.cols.getAllocatedHandle(setOp.col);
			const rowsRefSeq = this.rows.getCollabWindow().currentSeq;
			const colsRefSeq = this.cols.getCollabWindow().currentSeq;
			if (this.undo !== undefined) {
				let oldValue = this.cells.getCell(rowHandle, colHandle);
				if (oldValue === null) {
					oldValue = undefined;
				}

				this.undo.cellSet(rowHandle, colHandle, oldValue);
			}

			this.cells.setCell(rowHandle, colHandle, setOp.value);
			const localSeq = this.nextLocalSeq();
			const metadata: ISetOpMetadata = {
				rowHandle,
				colHandle,
				localSeq,
				rowsRefSeq,
				colsRefSeq,
				referenceSeqNumber: this.runtime.deltaManager.lastSequenceNumber,
			};

			this.pending.setCell(rowHandle, colHandle, localSeq);
			return metadata;
		}
	}
}
