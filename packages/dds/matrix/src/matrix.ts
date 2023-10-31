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
	SummarySerializer,
} from "@fluidframework/shared-object-base";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { ObjectStoragePartition, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IMatrixProducer, IMatrixConsumer, IMatrixReader, IMatrixWriter } from "@tiny-calc/nano";
import {
	MergeTreeDeltaType,
	IMergeTreeOp,
	SegmentGroup,
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
}

interface ISetOpMetadata {
	rowHandle: Handle;
	colHandle: Handle;
	localSeq: number;
	rowsRefSeq: number;
	colsRefSeq: number;
	referenceSeqNumber: number;
	clientId: string | undefined;
}

export interface ISharedMatrixEvents<T> extends ISharedObjectEvents {
	/**
	 * Emitted when there is a conflict when this client tries to set a cell value in the {@link SharedMatrix}.
	 * It could be due to race condition between different clients where this client set op loses or when
	 * the client tries to set again before its previous set is acked.
	 * Race Condition: It means we did not know about the Set op from other client when we sent the set op, but
	 * we received the remote Op and set that value for the cell. Now when we get our local op back, we can not
	 * overwrite the value due to FWW and need to resolve conflict.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `row` - Row number at which conflict happened.
	 *
	 * - `col` - Col number at which conflict happened.
	 *
	 * - `currentValue` - The current value of the cell.
	 *
	 * - `ignoredValue` - The value that this client tried to set in the cell and got ignored due to conflict.
	 *
	 * - `target` - The {@link SharedMatrix} itself.
	 */
	(
		event: "conflict",
		listener: (
			row: number,
			col: number,
			currentValue: MatrixItem<T>,
			ignoredValue: MatrixItem<T>,
			target: IEventThisPlaceHolder,
		) => void,
	);
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
 *
 * @public
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
	private pending = new SparseArray2D<number>(); // Tracks pending writes.
	private cellLastWriteTracker = new SparseArray2D<CellLastWriteTrackerItem>(); // Tracks last writes sequence numner in a cell.

	constructor(
		runtime: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_matrix_");

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
		};

		const metadata: ISetOpMetadata = {
			rowHandle,
			colHandle,
			localSeq,
			rowsRefSeq,
			colsRefSeq,
			referenceSeqNumber: this.runtime.deltaManager.lastSequenceNumber,
			clientId: this.runtime.clientId,
		};

		this.submitLocalMessage(op, metadata);
		this.pending.setCell(rowHandle, colHandle, localSeq);
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

	/** @internal */ public _undoRemoveRows(rowStart: number, spec: IJSONSegment) {
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

	/** @internal */ public _undoRemoveCols(colStart: number, spec: IJSONSegment) {
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
		builder.addBlob(
			SnapshotPath.cells,
			serializer.stringify(
				[
					this.cells.snapshot(),
					this.pending.snapshot(),
					this.cellLastWriteTracker.snapshot(),
				],
				this.handle,
			),
		);
		return builder.getSummaryTree();
	}

	/**
	 * Runs serializer on the GC data for this SharedMatrix.
	 * All the IFluidHandle's stored in the cells represent routes to other objects.
	 */
	protected processGCDataCore(serializer: SummarySerializer) {
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
					clientId,
				} = localOpMetadata as ISetOpMetadata;

				const lastCellModificationDetails = this.cellLastWriteTracker.getCell(
					rowHandle,
					colHandle,
				);
				const row = this.rebasePosition(this.rows, setOp.row, rowsRefSeq, localSeq);
				const col = this.rebasePosition(this.cols, setOp.col, colsRefSeq, localSeq);
				if (row !== undefined && col !== undefined && row >= 0 && col >= 0) {
					// If we generated this op, after seeing the last set op, or it was from this client only
					// then regenerate the op, otherwise raise conflict.
					if (
						lastCellModificationDetails === undefined ||
						clientId === this.runtime.clientId ||
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
					} else {
						this.emit(
							"conflict",
							row,
							col,
							this.cells.getCell(rowHandle, colHandle), // Current value
							setOp.value, // Ignored value
						);
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
			const [cellData, pendingCliSeqData, cellLastWriteTracker] = await deserializeBlob(
				storage,
				SnapshotPath.cells,
				this.serializer,
			);

			this.cells = SparseArray2D.load(cellData);
			this.pending = SparseArray2D.load(pendingCliSeqData);
			this.cellLastWriteTracker = SparseArray2D.load(cellLastWriteTracker);
		} catch (error) {
			this.logger.sendErrorEvent({ eventName: "MatrixLoadFailed" }, error);
		}
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

				const { row, col } = contents;

				const adjustedRow = this.rows.adjustPosition(row, rawMessage);
				if (adjustedRow !== undefined) {
					const adjustedCol = this.cols.adjustPosition(col, rawMessage);

					if (adjustedCol !== undefined) {
						const rowHandle =
							(localOpMetadata as ISetOpMetadata)?.rowHandle ??
							this.rows.getAllocatedHandle(adjustedRow);
						const colHandle =
							(localOpMetadata as ISetOpMetadata)?.colHandle ??
							this.cols.getAllocatedHandle(adjustedCol);

						assert(
							isHandleValid(rowHandle) && isHandleValid(colHandle),
							0x022 /* "SharedMatrix row and/or col handles are invalid!" */,
						);

						const lastCellModificationDetails = this.cellLastWriteTracker.getCell(
							rowHandle,
							colHandle,
						);

						const { value } = contents;
						assert(rawMessage.clientId !== null, "clientid should not be null!!");
						// If someone tried to Overwrite the cell value or first write on this cell or
						// same client tried to modify the cell.
						if (
							lastCellModificationDetails === undefined ||
							lastCellModificationDetails.clientId === rawMessage.clientId ||
							rawMessage.referenceSequenceNumber >= lastCellModificationDetails.seqNum
						) {
							if (!local) {
								this.cells.setCell(rowHandle, colHandle, value);
								for (const consumer of this.consumers.values()) {
									consumer.cellsChanged(adjustedRow, adjustedCol, 1, 1, this);
								}
							}
							this.cellLastWriteTracker.setCell(rowHandle, colHandle, {
								seqNum: rawMessage.sequenceNumber,
								clientId: rawMessage.clientId,
							});
						} else if (local) {
							// conflict. We would already set the right contents in the cell, when we would have received
							// set op for that cell from other client.
							this.emit(
								"conflict",
								row,
								col,
								this.cells.getCell(rowHandle, colHandle), // Current value
								value, // Ignored value
							);
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
				clientId: this.runtime.clientId,
			};

			this.pending.setCell(rowHandle, colHandle, localSeq);
			return metadata;
		}
	}
}
