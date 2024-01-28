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

const matrixId = "matrix";

type MatrixType = any;

interface IEfficientMatrix extends ISharedMatrix<MatrixType> {}

export class TempCollabSpaceRuntime extends FluidDataStoreRuntime implements IEfficientMatrix {
	protected matrixInternal?: SharedMatrix;

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
	}

	// Assumption here is that this public API is called after
	// Data store had a chance to process all ops, including remote (on load) and stashed.
	// And thus if
	public get matrix() {
		assert(this.matrixInternal !== undefined, "not initialized");
		return this.matrixInternal;
	}

	// #region IMatrixProducer

	openMatrix(consumer: IMatrixConsumer<MatrixItem<MatrixType>>): IMatrixReader<MatrixItem<MatrixType>> {
		this.matrix.openMatrix(consumer);
		return this;
	}

	closeMatrix(consumer: IMatrixConsumer<MatrixItem<MatrixType>>): void {
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

	public getCell(row: number, col: number): MatrixItem<MatrixType> {
		// TBD
		throw new Error("NYI");
	}

	public get matrixProducer(): IMatrixProducer<MatrixItem<MatrixType>> {
		return this;
	}

	// #endregion IMatrixReader

	// #region IMatrixWriter

	public setCell(row: number, col: number, value: MatrixItem<MatrixType>) {}

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
