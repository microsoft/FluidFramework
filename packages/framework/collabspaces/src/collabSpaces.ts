/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IFluidDataStoreContext,
	VisibilityState,
} from "@fluidframework/runtime-definitions";
import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { FluidDataStoreRuntime, IChannelContext } from "@fluidframework/datastore";
import {
	SharedMatrix,
	SharedMatrixFactory,
	MatrixItem,
	ISharedMatrixEvents,
} from "@fluidframework/matrix";
import { UsageError } from "@fluidframework/telemetry-utils";
import { addBlobToSummary } from "@fluidframework/runtime-utils";
import { readAndParse } from "@fluidframework/driver-utils";
import { IMatrixConsumer, IMatrixReader, IMatrixProducer } from "@tiny-calc/nano";
import { v4 as uuid } from "uuid";
import {
	MatrixExternalType,
	ICollabChannel,
	ICollabChannelCore,
	IEfficientMatrix,
	ICollabChannelFactory,
} from "./contracts";

/*
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
 *     1. Do not send channel attach op (or content on next / each op). Any future op for a channel results in implicit
 *        channel creation
 *        - If such channel is no longer "rooted" in the cell, we have nowhere to get initial state for channel
 *          creation! And thus we might need to delay that process up until channel is rooted again (through undo op).
 *     2. We could send attach ops, but when processing one, ignore it if channel is already created.
 *        - This can not be required step (but can be optional). That's because other client could have destroyed channel,
 *          and would need to figure out initial state when it sees an op comming for non-existing channel. A client with
 *          undo records is likely to keep channels much longer (in memory) then other clients, and thus may send ops (undo)
 *          when all other clients already destroyed such channel.
 *        - Thus, sending attach ops is more like corener case of #3 below.
 *        - That said, we should delay sending attach op until there are any changes in the channel. User could be scrolling
 *          through table and that might create channels in anticipation of user typing (rich components are created and they
 *          need channel to initialize and render), but user might not edit anything. And thus we better move to #3.
 *     3. Include the value before change with every op. It would be only used by clients (for creation of channel, or
 *          validation) if receiving client either does not have that channel created, or such channel has no ops overlapping
 *          with collab window
 *        - We can use op content to validate that indeed conversion from interop format to collab format was
 *          functional. If not, we should close container with error, and not continue as eventual consistency is broken
 *          (ideally, all other clients should ignore all other ops from "looser" client that were already sent and acked;
 *          "looser" in this context - a client who was not the first to send channel attach op and discover mismatch).
 *        - This also removes the need to store hashes as alternative way to validate such transitions as being
 *          functional.
 *        - A client (when receiving first channel op) may find itself in a position where channel is not longer associated
 *          with any cell. But undo can still bring it back. Such client (at least in today's system) has no place to get
 *          initial state for a channel (Matrix does not behave like Sequence DDS - it does not store all states of all
 *          clients within collab window, it only stores latest state)
 *        - Leaving possible performance / bandwith issues aside, it will be hard to accomplish that design, unless we push
 *          that responsibility to channels. Consider op rebasing case - Matrix (or code around it) can't reconstuct the
 *          state of the cell before such op - we simply do not have enough data to do so. That said, most DDSs do not have
 *          that data either, as they use LWW (Last Writer Wins) policy and simply do not track such state.
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
 */

const matrixId = "matrix";
const channelSummaryBlobName = "channelInfo";

interface MatrixInternalType extends MatrixExternalType {
	// This is channel ID modifier.
	// Each cell could have only one active channel, but many passive channels associated with it.
	// Every time a cell is overwritten, iteration number is bumped, creating new channel.
	// Old channel might be still around and could be returned through undo.
	iteration: number;

	// Every time channel saves its state in the cell, it records a sequence number when such change
	// was valid. The value in the cell is the truth only if there are no other changes in the channel
	// past that sequence number.
	seq: number;
}

type ICellInfo =
	| {
			value: undefined;
			channel: undefined;
			channelId: undefined;
	  }
	| {
			value: Exclude<MatrixItem<MatrixInternalType>, undefined>;
			channel: Promise<ICollabChannelCore> | undefined;
			channelId: string;
	  };

interface IChannelTrackingInfo {
	// Sequence number of the last message for this channel.
	// Only evaluated for acked messages. I.e. if there are any local pending messages, this propertly
	// is not reflecting such messages.
	seq: number;

	// Number of local non-acked messages. Value is never negative. Positive numbers means channel is "dirty".
	pendingChangeCount: number;
}

/*
	To be implemented:
	- "conflict" events
	- Types that do not support collaboration (like numbers, dates)
		Right now we assume that every type is represented by channel factory, but there is no need
		for that if types are not collaborative.
	- Properly implement GC of channels (and exposure of channel info to GC)
	- hange events - changes being made by channels should result in events fired by this object.
*/

/** @internal */
export class TempCollabSpaceRuntime
	extends FluidDataStoreRuntime<ISharedMatrixEvents<MatrixExternalType>>
	implements IEfficientMatrix
{
	private matrixInternal?: SharedMatrix<MatrixInternalType>;
	private channelInfo: Record<string, IChannelTrackingInfo | undefined> = {};

	constructor(
		dataStoreContext: IFluidDataStoreContext,
		sharedObjects: Readonly<ICollabChannelFactory[]>,
		existing: boolean,
		provideEntryPoint: (runtime: IFluidDataStoreRuntime) => Promise<FluidObject>,
	) {
		const factories: IChannelFactory[] = [...sharedObjects, new SharedMatrixFactory()];
		const sharedObjectRegistry = new Map(factories.map((ext) => [ext.type, ext]));

		super(dataStoreContext, sharedObjectRegistry, existing, provideEntryPoint);
	}

	private criticalError(error): never {
		this.logger.sendErrorEvent({ eventName: "CollabSpaces" }, error);
		throw error;
	}

	// Called on various paths, like op processing, where channel should exists.
	private updatePendingCoutner(address: string, diff: number, allowImplicitCreation: boolean) {
		if (address === matrixId) {
			return;
		}
		const channel = this.contexts.get(address);
		if (channel === undefined) {
			if (!allowImplicitCreation) {
				// Channel has to be there, the fact that it's not here is a integrity violation!
				this.criticalError(new Error("collabSpaces: intergity violation"));
			}

			// Here are two considerations:
			// This is syncronous function, while creation of the channel is async
			// We might not be able to create a channel IF this channel is not rooted in a cell.
			// We will need to hold on to all the ops, when if/when (through undo) channel becomes
			// active again, recreated it!
			const { row, col, iteration } = this.mapChannelToCell(address);
			const currValue = this.matrix.getCell(row, col);
			if (currValue === undefined || String(currValue.iteration) !== iteration) {
				// This channel is not rooted (not current). We do not have initial state (before ops started
				// to flow) to create it. Thus the only option - accumulate ops for later usage.
				// TBD(Pri1): Need to create context.
				this.criticalError(Error("TBD"));
			} else {
				this.createCollabChannel(currValue, address);
			}
		}

		const record = this.channelInfo[address];
		assert(record !== undefined, "every channel should have a record");

		record.pendingChangeCount += diff;
		assert(record.pendingChangeCount >= 0, "counter should be non-negative!");
	}

	protected setChannelDirty(address: string): void {
		// It's not very clear RE what it means in context of this implementation.
		// Currently it is used to force summmary for a channel, but such channels
		// likely can't be used for temp collab spaces, as we could destroy them prematurely.
		// We could likely take it into account, but not clear if it's needed yet.
		assert(false, "logic error");
		// super.setChannelDirty(dirty);
	}

	protected async applyStashedChannelChannelOp(address: string, contents: any) {
		// This operation does not change counter, at least not directly.
		// It will result in channel sending op, and that's how it will be accoutned for.
		// That said, need to ensure we have a channel allocated for it.
		this.updatePendingCoutner(address, 0, true /* allowImplicitCreation */);
		return super.applyStashedChannelChannelOp(address, contents);
	}

	protected processChannelOp(
		address: string,
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		// offset increase by submitChannelOp()
		this.updatePendingCoutner(address, local ? -1 : 0, true /* allowImplicitCreation */);
		super.processChannelOp(address, message, local, localOpMetadata);
	}

	protected reSubmitChannelOp(address: string, contents: any, localOpMetadata: unknown) {
		// Message was not sent, so our +1 in submitChannelOp() needs to be offset
		// DDS may chose to send any number of ops (including zero) as part of resubmit flow
		// All such ops would be properly accounted on submitChannelOp() path.
		this.updatePendingCoutner(address, -1, false /* allowImplicitCreation */);
		super.reSubmitChannelOp(address, contents, localOpMetadata);
	}

	protected submitChannelOp(address: string, contents: any, localOpMetadata: unknown) {
		this.updatePendingCoutner(address, 1, false /* allowImplicitCreation */);
		super.submitChannelOp(address, contents, localOpMetadata);
	}

	// protected sendAttachChannelOp(channel: IChannel): void {}

	public processSignal(message: any, local: boolean) {
		this.criticalError(new Error("Not supported"));
	}

	public rollback(type: string, content: any, localOpMetadata: unknown): void {
		this.criticalError(new Error("Not supported"));
	}

	public async request(request: IRequest): Promise<IResponse> {
		this.criticalError(new Error("Not supported"));
	}

	public getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
		const summary = super.getAttachSummary(telemetryContext);
		addBlobToSummary(summary, channelSummaryBlobName, JSON.stringify(this.channelInfo));
		return summary;
	}

	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		// Do some garbage collection for channels that we do not need.
		for (const [channelId, channel] of this.contexts) {
			if (channelId !== matrixId) {
				this.saveOrDestroyChannel(
					(await channel.getChannel()) as ICollabChannel,
					false /* allowSave */,
					true /* allowDestroy */,
				);
			}
		}

		const summary = await super.summarize(fullTree, trackState, telemetryContext);
		addBlobToSummary(summary, channelSummaryBlobName, JSON.stringify(this.channelInfo));
		return summary;
	}

	protected attachRemoteChannel(id: string, remoteChannelContext: IChannelContext) {
		if (!this.contexts.has(id)) {
			super.attachRemoteChannel(id, remoteChannelContext);
			this.channelCreated(id);
		} else {
			// TBD(Pri2) - we should verify that initial state conveyed in this op is exactly
			// the same as the one this client started with.
		}
	}

	/**
	 * Public API
	 */

	// Should be called by data store runtime factory
	public async initialize(existing: boolean) {
		if (!existing) {
			this.matrixInternal = this.createChannel(
				matrixId,
				SharedMatrixFactory.Type,
			) as SharedMatrix;

			// Insert row/col for tracking row/col internal IDs
			this.matrixInternal.insertCols(0, 1);
			this.matrixInternal.insertRows(0, 1);

			// Ensure it will attach when this data store attaches
			this.matrixInternal.bindToContext();
		} else {
			this.matrixInternal = (await this.getChannel(matrixId)) as SharedMatrix;

			assert(this.dataStoreContext.baseSnapshot !== undefined, "loading from snasphot");
			const blobId = this.dataStoreContext.baseSnapshot.blobs[channelSummaryBlobName];
			assert(blobId !== undefined, "channelInfo not present");
			this.channelInfo = await readAndParse<Record<string, IChannelTrackingInfo>>(
				this.dataStoreContext.storage,
				blobId,
			);
		}
		this.matrix.switchSetCellPolicy();
	}

	private get matrix() {
		assert(this.matrixInternal !== undefined, "not initialized");
		return this.matrixInternal;
	}

	private getCellInfo(rowArg: number, colArg: number): ICellInfo {
		const row = rowArg + 1;
		const col = colArg + 1;
		const cellValue = this.matrix.getCell(row, col);
		if (cellValue === undefined) {
			return { value: undefined, channel: undefined, channelId: undefined };
		}
		const rowId = this.matrix.getCell(row, 0) as unknown as string;
		const colId = this.matrix.getCell(0, col) as unknown as string;
		const channelId = `${rowId},${colId},${cellValue.iteration}`;
		const channel = this.contexts.get(channelId)?.getChannel();

		return {
			value: cellValue,
			channel: channel as Promise<ICollabChannelCore> | undefined,
			channelId,
		};
	}

	private getFactoryForValueType(type: string, onlyCollaborativeTypes: boolean) {
		// Matrix is in the list of channels, but it's "internal" type - not allowed to be used in cells.
		if (type === SharedMatrixFactory.Type) {
			return undefined;
		}
		const factory = this.sharedObjectRegistry.get(type);
		return factory as ICollabChannelFactory;
	}

	private channelCreated(channelId: string) {
		assert(this.channelInfo[channelId] === undefined, "channel is in inconsistent state");
		this.channelInfo[channelId] = {
			// -1 here is important for couple reasons:
			// If this object is detached, we have no sequence to operate with, and any future sequences
			// should be higher than this starting point.
			// If it's attached, then any sequence below current sequence number is good and has same treatment.
			seq: -1,
			pendingChangeCount: 0,
		};
	}
	private createCollabChannel(value: MatrixInternalType, channelId: string) {
		const factory = this.getFactoryForValueType(value.type, true /* onlyCollaborativeTypes */);
		assert(factory !== undefined, "Factory is missing for matrix type");

		const newChannel = factory.create2(this, channelId, value.value);
		this.addChannel(newChannel);

		// TBD(Pri2) - make sure it is properly attached to data store.
		// Everywhere in code we call appropriate newChannel.bindToContext(), but that's not an API on a channel interface.
		// Feels like I should call this.bindChannel(newChannel) here, but it fails - this.notBoundedChannelContextSet
		// gets cleared first and then we get back (recursion) into this.bindChannel() and hit assert.
		// this.bind(newChannel.handle) does not seem to work properly if this happens in detached container.
		// newChannel.handle.attachGraph() seems like works the best, even though it's deprecated.
		// We can add bindToContext() to ICollabChannelCore, but it feels like that should be better way to do it!
		newChannel.handle.attachGraph();

		this.channelCreated(channelId);

		return newChannel;
	}

	public async getCellChannel(row: number, col: number): Promise<ICollabChannelCore> {
		const { value, channel, channelId } = this.getCellInfo(row, col);
		if (value === undefined) {
			throw new UsageError("Can't create channel for undefined cell");
		}
		if (channel !== undefined) {
			return channel;
		}

		return this.createCollabChannel(value, channelId);
	}

	private mapChannelToCell(channelId: string) {
		const parts = channelId.split(",");
		assert(parts.length === 3, "wrong channel ID");
		const rowId = parts[0];
		const colId = parts[1];
		const iteration = parts[2];

		// TBD(Pri0)
		// This needs to be way more efficient by building a reverse mapping and maintaining it through all operations!
		// Need to reconcile which layer does such mapping. At the moment, this is done outside of matrix - in Tablero
		// component. We should either move it here (and ideally - in compatible way, i.e. not changing document schema),
		// or move most of the channel logic to the layer that implements row/col stable IDs.

		const rowCount = this.matrix.rowCount;
		const colCount = this.matrix.colCount;

		let row;
		for (row = 1; row < rowCount; row++) {
			if ((this.matrix.getCell(row, 0) as unknown as string) === rowId) {
				break;
			}
		}
		assert(row !== rowCount, "channel not found");

		let col;
		for (col = 1; col < colCount; col++) {
			if ((this.matrix.getCell(0, col) as unknown as string) === colId) {
				break;
			}
		}
		assert(col !== colCount, "channel not found");

		return { row, col, iteration };
	}

	// Saves or destoys channel, depending on the arguments
	private saveOrDestroyChannel(
		channel: ICollabChannelCore,
		allowSave: boolean,
		allowDestroy: boolean,
	) {
		const channelId = (channel as ICollabChannel).id;

		const record = this.channelInfo[channelId];
		assert(record !== undefined, "every channel should have a record");

		// Can't do anything if there are any local changes.
		if (record.pendingChangeCount > 0) {
			return;
		}

		// Are ops flying? If not, we have no clue if channel was saved or not.
		const attached = this.visibilityState !== VisibilityState.GloballyVisible;

		const refSeq = attached ? -1 : this.deltaManager.lastSequenceNumber;
		assert(record.seq <= refSeq, "invalid seq number");

		const { row, col, iteration } = this.mapChannelToCell(channelId);

		const currValue = this.matrix.getCell(row, col);

		// TBD(Pri2) - can this be optimized and assume only single client can undo such operation?
		//
		// If channel is no longer associated with a cell, can't do much!
		// We are dealing with non-rooted channel. It could be returned back to life through undo
		// It's possible that it sits on undo stack of multiple clients (imagine that both clients
		// concurrently changed type of a column - one offline, one not, and thus either of them can run
		// undo and return it back to life).
		// In the worst case, this channel will be collected by GC (though need to validate that!)
		if (currValue === undefined || String(currValue.iteration) !== iteration) {
			return;
		}

		assert(currValue.seq <= refSeq, "invalid seq number");

		// Note on op grouping and equal sequence numbers: There will be cases (due to reentrancy when
		// processing op batches) where ligic below could be optimized to require less saves, because
		// we would do unnessasary saves. While true, this would also requrie tracking more state in cells.
		// Given that chances of that are low, and code is correct, it's better to rely on extra saves
		// then inefficiency of managing more state.

		const doSave = allowSave && !attached && currValue.seq <= record.seq;
		const destroy = allowDestroy && (attached ? currValue.seq > record.seq : doSave);

		if (doSave) {
			this.matrix.setCell(row, col, {
				...currValue, // value, iteration, type
				value: channel.value as string,
				seq: refSeq,
			});
		}

		if (destroy) {
			// Validate that actually values match!
			assert(channel.value === currValue.value, "values are not matching!!!!");

			if (allowDestroy) {
				// Is this safe? Anything else we need to do?
				this.contexts.delete(channelId);
				this.notBoundedChannelContextSet.delete(channelId);
				this.channelInfo[channelId] = undefined;
			}
		}
	}

	public saveChannelState(channel: ICollabChannelCore) {
		this.saveOrDestroyChannel(channel, true /* allowSave */, false /* allowDestroy */);
	}

	// TBD(Pri1) - need to build a lot of protections here on when it's safe to do this operaton
	public destroyCellChannel(channel: ICollabChannelCore) {
		this.saveOrDestroyChannel(channel, true /* allowSave */, true /* allowDestroy */);
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
		return this.matrix.rowCount - 1;
	}
	public get colCount() {
		return this.matrix.colCount - 1;
	}

	public getCell(row: number, col: number): MatrixItem<MatrixExternalType> {
		// Implementation below can't deal with async nature of getting to channels.
		this.criticalError(new Error("use getCellAsync()"));

		/*
		const {value, channel} = this.getCellInfo(row, col);
		if (value === undefined) {
			return {value: undefined, type: "undefined" };
		}
		if (channel !== undefined) {
			 throw new Error("use getCellAsync()");
		}
		const val = channel === value.value;
		return { value: val, type: value.type };
		*/
	}

	public async getCellAsync(row: number, col: number): Promise<MatrixItem<MatrixExternalType>> {
		const { value, channel } = this.getCellInfo(row, col);
		if (value === undefined) {
			return { value: undefined, type: "undefined" };
		}
		let val = value.value;
		if (channel !== undefined) {
			const ch = await channel;
			val = ch.value as string;
		}
		return { value: val, type: value.type };
	}

	public get matrixProducer(): IMatrixProducer<MatrixItem<MatrixExternalType>> {
		return this;
	}

	// #endregion IMatrixReader

	// #region IMatrixWriter

	public setCell(rowArg: number, colArg: number, value: MatrixItem<MatrixExternalType>) {
		const row = rowArg + 1;
		const col = colArg + 1;
		if (value === undefined) {
			this.matrix.setCell(row, col, value);
		} else {
			// Check that we will be able to create a channel for it in the future.
			if (
				this.getFactoryForValueType(value.type, false /* onlyCollaborativeTypes */) ===
				undefined
			) {
				throw new UsageError("Matrix: Unknown value type");
			}

			const currentValue = this.matrix.getCell(row, col);
			const iteration = currentValue ? currentValue.iteration + 1 : 1;
			const seq = this.deltaManager.lastSequenceNumber;
			const valueInternal = { ...value, iteration, seq };
			this.matrix.setCell(row, col, valueInternal);
		}
	}

	// #endregion IMatrixWriter

	// #region ISharedMatrix

	public insertCols(colStartArg: number, countArg: number) {
		let col = colStartArg + 1;
		let count = countArg;
		this.matrix.insertCols(col, count);
		// generate new ID for a columns
		while (count > 0) {
			count--;
			this.matrix.setCell(0, col, uuid() as unknown as MatrixInternalType);
			col++;
		}
	}

	public removeCols(colStart: number, count: number) {
		this.matrix.removeCols(colStart + 1, count);
	}

	public insertRows(rowStartArg: number, countArg: number) {
		let row = rowStartArg + 1;
		let count = countArg;
		this.matrix.insertRows(row, count);
		// generate new ID for a rows
		// generate new ID for a columns
		while (count > 0) {
			count--;
			this.matrix.setCell(row, 0, uuid() as unknown as MatrixInternalType);
			row++;
		}
	}

	public removeRows(rowStart: number, count: number) {
		this.matrix.removeRows(rowStart + 1, count);
	}

	// #endregion ISharedMatrix
}
