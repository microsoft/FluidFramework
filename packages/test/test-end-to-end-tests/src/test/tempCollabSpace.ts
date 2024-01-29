/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions";
import { IChannel } from "@fluidframework/datastore-definitions";
import { assert } from "@fluidframework/core-utils";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
	FluidDataStoreRuntime,
	IChannelContext,
	ISharedObjectRegistry,
} from "@fluidframework/datastore";
import {
	SharedMatrix,
	SharedMatrixFactory,
	ISharedMatrix,
	MatrixItem,
} from "@fluidframework/matrix";
import { IMatrixConsumer, IMatrixReader, IMatrixProducer } from "@tiny-calc/nano";
import { CounterFactory } from "@fluidframework/counter";
import { Serializable } from "@fluidframework/datastore-definitions";

/**
 * This is a prototype, an implementation of sparse matrix that natively supports collaboration.
 * The main ideas of prototype:
 * 1. At rest, data is stored in interop format direction in sparse matrix. Interop format could be anything,
 *    and is defined per data type. For example, rich text could be stored as HTML, numbers stored as numbers,
 *    and date could be stored in specific serialized format.
 * 2. There are two ways to change data:
 *    - Overwriting data in a cell. FWW (First writer wins) merge policy is used (more on implications later)
 *    - Collaborating on data.
 * 3. When collaboration is required, a collaboration "channel" is created. Channel is accosiated with a cell, and acts
 *    and behaves as a DDSs, with couple key exceptions:
 *    - When channel is creted, it does not result in attach op being sent. System assumes that this is not required,
 *      as conversion from serialized format to collab format is functional, i.e. all clients will do exactly same
 *      convesion and will arrive to exactly same (initial) representation
 *    - When it's safe to destroy collaboraton channel, it's destroed without any ops, after latest serialized
 *      representation of channel has been stored back in matrix.
 *  4. The key assumption of the system - there are relatively few collaboration channels at any moment.
 *  5. While this is not part of initial prototype, eventually we want to allow storing handles to components, and thus
 *    being fully forward-compatible with how Loop represents data for tables today. I.e. not require data migration.
 *  6. Ideally, channels to have same behavior as today (when component handles are stored in matrix). I.e. if cell is
 *    overwritten (for example, because it's type is changed from rich text to date), old channel (associated with a
 *    cell, in this example - rich text channel) becomes hanging in the air. Any ops that are sent for this channel
 *    will still be processed and applied to such channel. If original cell overwrite is undone, then old channel is
 *    back associated with cell, and all such changes that happened in the past (even when channel was no longer
 *    associated with cell) will show up.
 *    - That said, this makes it much harder to do GC of channels. Essentially any channel that is hanging in the air
 *      like that could be collected by GC, only after 30 days (GC policy). That migth be too much garbage to collect.
 *    - At the same time, column type change & immidiate undo done by offline client should not wipe any chances
 *      when client goes online! It migth if we are not careful (for example, current matrix implementation does exaclty
 *      that - it stored old value and overwrites cell with old value, which is incorrect as old value represents only
 *      what was known to this client at the time it did change cell, and does not account any changes by other clients
 *      that might have sequenced before either of those two operations)
 *
 * Some notes on implementation:
 *  1. When it comes to channel creation, we could chose between these two options:
 *     1. Do not send channel attach op. Any future op for a channel results in implicit channel creation
 *     2. We could send attach ops, but when processing one, ignore it if channel is already created.
 *     Second approach has some key advantages:
 *     - We can use attach op content to validate that indeed conversion from interop format to collab format was
 *       functional. If not, we should close container with error, and not continue as eventual consistency is broken
 *       (ideally, all other clients should ignore all other ops from "looser" client that were already sent and acked;
 *       "looser" in this context - a client who was not the first to send channel attach op and discover mismatch).
 *     - This also removes the need to store hashes as alaternative way to validate such transitions as being
 *       functional.
 *     - A client (when receiving first channel op) may find itself in a position where channel is not longer associated
 *       with any cell. But undo can still bring it back. Such client (at least in today's system) has no place to get
 *       initial state for a channel (Matrix does not behave like Sequence DDS - it does not store all states of all
 *       clients within collab window, it only stores latest state)
 *     That said, we should delay sending attach op until there are any changes in the channel. User could be scrolling
 *     through table and that might create channels in anticipation of user typing (rich components are created and they
 *     need channel to initialize and render), but user might not edit anything.
 * 2. We need to map channel names to cells (when receiving channel op while channel is not created yet). There are a
 *    number of ways to do so:
 *    - each op (in addition to channel name) could include column / row information, which could be mapped to current
 *      row & column (see SharedMatrix.processCore() and this.rows.adjustPosition() call). This would likely require
 *      exposing some SharedMatrix guts through public API.
 *    - channel name contains stable column / row IDs (guids), and each client maintains reverse mapping. This is how
 *      Loop's table implements it today - I believe first row & first column contain only metadata (no user data) -
 *      uuids for columns / rows.
 * 3. When evaluating cell value, we need to check if it has active channel associated with it. This operation should
 *    be optimized to be fast, especially for main case (no channel)
 *  
*/

const matrixId = "matrix";

interface MatrixExternalType {
	value: Serializable<unknown>;
	type: string;
}

interface MatrixInernalType extends MatrixExternalType {
	iteration: number;
}

interface IEfficientMatrix extends ISharedMatrix<MatrixExternalType> {}

export class TempCollabSpaceRuntime extends FluidDataStoreRuntime implements IEfficientMatrix {
	protected matrixInternal?: SharedMatrix<MatrixInernalType>;

	constructor(
		dataStoreContext: IFluidDataStoreContext,
		sharedObjectRegistry: ISharedObjectRegistry,
		existing: boolean,
		provideEntryPoint: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		super(dataStoreContext, sharedObjectRegistry, existing, provideEntryPoint);
	}

	// When channel is created, need to call this.bindChannel(channel) right away
	protected createChannelCore(channel: IChannel) {
		super.createChannelCore(channel);
		super.bindChannel(channel);
	}

	protected sendAttachChannelOp(channel: IChannel): void {
		// Skip, with exception of initial matrix!
		if (channel.id === matrixId) {
			super.sendAttachChannelOp(channel);
		}
	}

	public processSignal(message: any, local: boolean) {
		throw new Error("Not supported");
	}

	public rollback(type: string, content: any, localOpMetadata: unknown): void {
		throw new Error("Not supported");
	}

	public request(request: IRequest): Promise<IResponse> {
		throw new Error("Not supported");
	}

	public summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		// We can do certain clenup here to GC unneeded data
		// But system should work correctly without it.
		return super.summarize(fullTree, trackState, telemetryContext);
	}

	// Called on various paths, like op processing, where channel should exists.
	protected getChannelContext(id: string): IChannelContext {
		const channelContext = this.contexts.get(id);
		if (channelContext == undefined) {
			assert(id !== matrixId, "Missing channel");
		}
		return channelContext;
	}

	/**
	 * Public API
	 **/

	// Should be called by data store runtime factory
	public async initialize(existing: boolean) {
		if (!existing) {
			this.matrixInternal = (await this.createChannel(
				matrixId,
				SharedMatrixFactory.Type,
			)) as SharedMatrix;
		} else {
			this.matrixInternal = (await this.getChannel(matrixId)) as SharedMatrix;
		}
		this.matrix.switchSetCellPolicy();
	}

	// Assumption here is that this public API is called after
	// Data store had a chance to process all ops, including remote (on load) and stashed.
	// And thus if
	public get matrix() {
		assert(this.matrixInternal !== undefined, "not initialized");
		return this.matrixInternal;
	}

	// #region IMatrixProducer

	openMatrix(
		consumer: IMatrixConsumer<MatrixItem<MatrixExternalType>>,
	): IMatrixReader<MatrixItem<MatrixExternalType>> {
		this.matrix.openMatrix(consumer);
		return this;
	}

	closeMatrix(consumer: IMatrixConsumer<MatrixItem<MatrixExternalType>>): void {
		this.matrix.closeMatrix(consumer);
	}

	// #endregion IMatrixProducer

	// #region IMatrixReader

	public get rowCount() {
		return this.matrix.rowCount;
	}
	public get colCount() {
		return this.matrix.colCount;
	}

	public getCell(row: number, col: number): MatrixItem<MatrixExternalType> {
		// TBD
		throw new Error("NYI");
	}

	public get matrixProducer(): IMatrixProducer<MatrixItem<MatrixExternalType>> {
		return this;
	}

	// #endregion IMatrixReader

	// #region IMatrixWriter

	public setCell(row: number, col: number, value: MatrixItem<MatrixExternalType>) {
		if (value === undefined) {
			this.matrix.setCell(row, col, value);
		} else {
			const currentValue = this.matrix.getCell(row, col);
			const iteration = currentValue ? currentValue.iteration + 1 : 1;
			const valueInternal = { ...value, iteration };
			this.matrix.setCell(row, col, valueInternal);
		}
	}

	// #endregion IMatrixWriter

	// #region ISharedMatrix

	public insertCols(colStart: number, count: number) {
		this.matrix.insertCols(colStart, count);
	}

	public removeCols(colStart: number, count: number) {
		this.matrix.removeCols(colStart, count);
	}

	public insertRows(rowStart: number, count: number) {
		this.matrix.insertRows(rowStart, count);
	}

	public removeRows(rowStart: number, count: number) {
		this.matrix.removeRows(rowStart, count);
	}

	// #endregion ISharedMatrix
}

export class TempCollabSpaceRuntimeFactory implements IFluidDataStoreFactory {
	private readonly sharedObjectRegistry: ISharedObjectRegistry;

	constructor(
		public readonly type: string,
		sharedObjects: readonly IChannelFactory[],
	) {
		if (this.type === "") {
			throw new Error("undefined type member");
		}
		this.sharedObjectRegistry = new Map(sharedObjects.map((ext) => [ext.type, ext]));
	}

	public get IFluidDataStoreFactory() {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime = new TempCollabSpaceRuntime(
			context,
			this.sharedObjectRegistry,
			existing,
			async (runtime: IFluidDataStoreRuntime) => {
				return runtime as TempCollabSpaceRuntime as IEfficientMatrix;
			},
		);

		await runtime.initialize(existing);
		return runtime;
	}
}

export function sampleFactory() {
	return new TempCollabSpaceRuntimeFactory("MatrixWithCollab", [new CounterFactory()]);
}
