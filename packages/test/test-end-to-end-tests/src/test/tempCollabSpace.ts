/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import {
	// IChannel,
	IChannelFactory,
	IFluidDataStoreRuntime,
	Serializable,
} from "@fluidframework/datastore-definitions";
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
	ISharedMatrixEvents,
} from "@fluidframework/matrix";
import { IMatrixConsumer, IMatrixReader, IMatrixProducer } from "@tiny-calc/nano";
import { CounterFactory } from "@fluidframework/counter";
import { v4 as uuid } from "uuid";

import { describeCompat } from "@fluid-private/test-version-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";

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

// interface for internal communication
interface ITempChannel {
	getValue(): unknown;
}

const matrixId = "matrix";

interface MatrixExternalType {
	value: Serializable<unknown>;
	type: string;
}

interface MatrixInernalType extends MatrixExternalType {
	iteration: number;
}

interface IEfficientMatrix extends Omit<ISharedMatrix<MatrixExternalType>, "getCell"> {
	// TBD - need to get rid of synchronous version, as I do not think we can deliver it.
	// Removing it causes a bunch of type issues, so leaving NYI version for now.
	getCell(row: number, col: number): MatrixItem<MatrixExternalType>;
	getCellAsync(row: number, col: number): Promise<MatrixItem<MatrixExternalType>>;
}


export class TempCollabSpaceRuntime
	extends FluidDataStoreRuntime<ISharedMatrixEvents<MatrixExternalType>>
	implements IEfficientMatrix
{
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
	// to ensure it's attached (and thus starts sending ops)
	/*
	protected createChannelCore(channel: IChannel) {
		super.createChannelCore(channel);
		super.bindChannel(channel);
	}
	*/

	// getChannelContext():
	// Called on various paths, like op processing, where channel should exists.
	// We can overwrite it and not send attach op if we want to have a design where
	// attaches are implicit (i.e. without ops). This requires substantial changes in design,
	// including
	// - Likely conveying (row, col) info on all ops for the channels, such that clients could quickly
	//   map channel ID to a cell (though other designs are possible)
	// - remaping that info on reSubmit() flow
	// protected getChannelContext(id: string): IChannelContext {}
	// protected sendAttachChannelOp(channel: IChannel): void {}

	public processSignal(message: any, local: boolean) {
		throw new Error("Not supported");
	}

	public rollback(type: string, content: any, localOpMetadata: unknown): void {
		throw new Error("Not supported");
	}

	public async request(request: IRequest): Promise<IResponse> {
		throw new Error("Not supported");
	}

	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		// We can do certain clenup here to GC unneeded data
		// But system should work correctly without it.
		return super.summarize(fullTree, trackState, telemetryContext);
	}

	protected attachRemoteChannel(id: string, remoteChannelContext: IChannelContext) {
		if (!this.contexts.has(id)) {
			super.attachRemoteChannel(id, remoteChannelContext);
		} else {
			// TBD - we should verify that initial state conveyed in this op is exactly
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
		return this.matrix.rowCount - 1;
	}
	public get colCount() {
		return this.matrix.colCount - 1;
	}

	public getCell(rowArg: number, colArg: number): MatrixItem<MatrixExternalType> {
		// Implementation below can't deal with async nature of getting to channels.
		throw new Error("use getCellAsync()");

	/*
		const row = rowArg + 1;
		const col = colArg + 1;
		const cellValue = this.matrix.getCell(row, col);
		if (cellValue === undefined) {
			return undefined;
		}
		const rowId = this.matrix.getCell(row, 0) as unknown as string;
		const colId = this.matrix.getCell(0, col) as unknown as string;
		const channelId = `${rowId}-${colId}-${cellValue.iteration}`;
		const channel = this.contexts.get(channelId)?.getChannel();
		if (channel !== undefined) {
			 throw new Error("use getCellAsync()");
		}
		const value = channel === cellValue.value;
		return { value, type: cellValue.type };
		*/
	}

	public async getCellAsync(rowArg: number, colArg: number): Promise<MatrixItem<MatrixExternalType>> {
		const row = rowArg + 1;
		const col = colArg + 1;
		const cellValue = this.matrix.getCell(row, col);
		if (cellValue === undefined) {
			return undefined;
		}
		const rowId = this.matrix.getCell(row, 0) as unknown as string;
		const colId = this.matrix.getCell(0, col) as unknown as string;
		const channelId = `${rowId}-${colId}-${cellValue.iteration}`;
		const channel = (await this.contexts.get(channelId)?.getChannel()) as ITempChannel | undefined;
		const value = channel === undefined ? cellValue.value : (channel.getValue() as string);
		return { value, type: cellValue.type };
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
			const currentValue = this.matrix.getCell(row, col);
			const iteration = currentValue ? currentValue.iteration + 1 : 1;
			const valueInternal = { ...value, iteration };
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
			this.matrix.setCell(0, col, uuid() as unknown as MatrixInernalType);
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
			this.matrix.setCell(row, 0, uuid() as unknown as MatrixInernalType);
			row++;
		}
	}

	public removeRows(rowStart: number, count: number) {
		this.matrix.removeRows(rowStart + 1, count);
	}

	// #endregion ISharedMatrix
}

/*
	To be implemented:
	- "conflict" events
*/

export class TempCollabSpaceRuntimeFactory implements IFluidDataStoreFactory {
	// TBD - incorporate ITempChannel requirement to sharedObjectRegistry
	private readonly sharedObjectRegistry: ISharedObjectRegistry;

	constructor(
		public readonly type: string,
		sharedObjects: readonly IChannelFactory[],
	) {
		if (this.type === "") {
			throw new Error("undefined type member");
		}
		const factories: IChannelFactory[] = [...sharedObjects, new SharedMatrixFactory()];
		this.sharedObjectRegistry = new Map(factories.map((ext) => [ext.type, ext]));
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
			async (runtimeArg: IFluidDataStoreRuntime) => {
				return runtimeArg as TempCollabSpaceRuntime as IEfficientMatrix;
			},
		);

		await runtime.initialize(existing);
		return runtime;
	}
}

export function sampleFactory() {
	return new TempCollabSpaceRuntimeFactory("MatrixWithCollab", [new CounterFactory()]);
}

describe("Temp Collab Space", () => {
	beforeEach(() => {});

	it("test", async () => {
		// const runtimeFactory = sampleFactory();
		// runtimeFactory.instantiateDataStore()
	});
});

/**
 * Validates that incremental summaries can be performed at the sub DDS level, i.e., a DDS can summarizer its
 * contents incrementally.
 */
describeCompat(
	"Incremental summaries can be generated for DDS content",
	"2.0.0-rc.1.0.0",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		const defaultFactory = sampleFactory();
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			runtimeOptions: {},
		});

		const createContainer = async (): Promise<IContainer> => {
			return provider.createContainer(runtimeFactory);
		};

		async function loadContainer(summaryVersion: string) {
			return provider.loadContainer(runtimeFactory, undefined, {
				[LoaderHeader.version]: summaryVersion,
			});
		}

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("Basic test", async () => {
			const container = await createContainer();
			const datastore = (await container.getEntryPoint()) as TempCollabSpaceRuntime;

			const cols = 40;
			const rows = 100000;

			// +700Mb, but only +200Mb if accounting GC after that.
			datastore.insertCols(0, cols);
			datastore.insertRows(0, rows);

			if (global !== undefined && global.gc !== undefined) {
				global.gc();
			}

			// +550Mb with GC step after that having almost no impact
			// Though if GC did not run in a step above, this number is much higher (+1GB),
			// suggesting that actual memory growth is 1GB, but 500Mb offset could be coming
			// from the fact that GC did not had a chance to run and cleanup after previous step.
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					datastore.setCell(r, c, { value: "foo", type: "foo" });
				}
			}

			if (global !== undefined && global.gc !== undefined) {
				global.gc();
			}

			// Read arbitrary column; 1.9s on my dev box
			// But only 234ms if using non-async function (and thus not doing await here)!
			const start = performance.now();
			for (let i = 0; i < rows; i++) {
				// await datastore.getCellAsync(i, 5);
				datastore.getCell(i, 5);
			}
			const time = performance.now() - start;

			await provider.ensureSynchronized();
		});
	},
);
