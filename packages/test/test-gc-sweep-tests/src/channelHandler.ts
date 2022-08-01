/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SharedCell } from "@fluidframework/cell";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { IChannel } from "@fluidframework/datastore-definitions";
import { Ink, IPen, IColor, IInkPoint } from "@fluidframework/ink";
import { SharedMap } from "@fluidframework/map";
import { ConsensusQueue, ConsensusResult } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";

export interface IRandomOpHandler {
	executeRandomNonHandleOp(): Promise<void>;
}

/**
 * TODO: opHandlers to add - SharedDirectoryHandler, SharedMatrixHandler and SharedStringHandler
 * Not sure if SharedString can store and remove handles.
 */
export abstract class OpHandler {
    protected readonly actions: (() => Promise<void>)[] = [];
	private _random: Random | undefined;

	public get random(): Random {
		assert(this._random !== undefined, "Random needs to be set first before we do any op handling");
		return this._random;
	}

	public set random(random: Random) {
		this._random = random;
	}

    constructor(
        protected readonly channel: IChannel,
    ) {}
}

export abstract class HandleOpHandler extends OpHandler {
    protected readonly removeHandleActions: (() => Promise<IFluidHandle | undefined>)[] = [];
    protected readonly handles: Map<string, IFluidHandle> = new Map();

	public async executeRandomAddHandleOp(handle: IFluidHandle): Promise<IFluidHandle | undefined> {
		const oldHandle = await this.addHandle(handle);
		this.handles.set(handle.absolutePath, handle);
		if (oldHandle !== undefined && oldHandle.absolutePath !== handle.absolutePath) {
			this.handles.delete(oldHandle.absolutePath);
		}
		return oldHandle;
    }

    public async executeRandomRemoveHandleOp(): Promise<IFluidHandle | undefined> {
		if (this.removeHandleActions.length === 0) {
			return undefined;
		}
		const action = this.random.pick(this.removeHandleActions);
		const handle = await action();
		if (handle !== undefined) {
			this.handles.delete(handle.absolutePath);
		}
		return handle;
    }

	protected abstract addHandle(handle: IFluidHandle): Promise<IFluidHandle | undefined>;
}

export class ConsensusQueueHandler extends HandleOpHandler {
    constructor(
        protected readonly channel: ConsensusQueue<IFluidHandle>,
    ) {
		super(channel);

		let result: IFluidHandle;
		const setValue = async (value: IFluidHandle): Promise<ConsensusResult> => {
			result = value;
			assert(result !== undefined, `ConsensusQueue removed nothing from the queue!`);
			return ConsensusResult.Complete;
		};
		const removeHandle = async () => {
			await channel.acquire(setValue);
			return result;
		};

		const removeHandle2 = async () => {
			await channel.waitAndAcquire(setValue);
			return result;
		};

		this.removeHandleActions.push(removeHandle);
		this.removeHandleActions.push(removeHandle2);
	}

	protected async addHandle(handle: IFluidHandle): Promise<undefined> {
		await this.channel.add(handle);
		return undefined;
	}
}

export class ConsensusRegisterCollectionHandler extends HandleOpHandler {
    constructor(
        protected readonly channel: ConsensusRegisterCollection<IFluidHandle>,
    ) {
		super(channel);
	}

	protected async addHandle(handle: IFluidHandle): Promise<IFluidHandle | undefined> {
		const oldHandle = this.channel.read(handle.absolutePath);
		await this.channel.write(handle.absolutePath, handle);
		return oldHandle;
	}
}

export class InkHandler extends OpHandler implements IRandomOpHandler {
    constructor(
        protected readonly channel: Ink,
    ) {
		super(channel);
		this.actions.push(async () => {
			this.createRandomStroke();
		});
		this.actions.push(async () => {
			let strokes = channel.getStrokes();
			if (strokes.length === 0) {
				this.createRandomStroke();
				strokes = channel.getStrokes();
			}
			const stroke = this.random.pick(strokes);
			const point: IInkPoint = {
				x: this.random.integer(1, 1000),
				y: this.random.integer(1, 1000),
				time: this.random.integer(1, 1000),
				pressure: this.random.integer(1, 1000),
			};

			channel.appendPointToStroke(point, stroke.id);
		});
		this.actions.push(async () => channel.clear());
	}

	private createRandomStroke() {
		const color: IColor = {
			r: this.random.integer(0, 256),
			g: this.random.integer(0, 256),
			b: this.random.integer(0, 256),
			a: this.random.integer(0, 100),
		};
		const pen: IPen = {
			color,
			thickness: this.random.integer(1, 10),
		};
		this.channel.createStroke(pen);
	}

	public async executeRandomNonHandleOp(): Promise<void> {
		assert(this.actions.length === 0, "this.actions should have actions added!");
		const action = this.random.pick(this.actions);
		await action();
	}
}

export class SharedCellHandler extends HandleOpHandler {
	constructor(
        protected readonly channel: SharedCell<IFluidHandle>,
    ) {
		super(channel);
		this.removeHandleActions.push(async () => this.removeHandle());
	}

	protected async addHandle(handle: IFluidHandle): Promise<IFluidHandle | undefined> {
		const potentialHandle = this.channel.get();
		this.channel.set(handle);
		this.handles.set(handle.absolutePath, handle);
		if (potentialHandle !== undefined) {
			this.handles.delete(potentialHandle.absolutePath);
		}
		return potentialHandle;
	}

	private removeHandle(): IFluidHandle | undefined {
		const handle = this.channel.get();
		this.channel.delete();
		if (handle !== undefined) {
			this.handles.delete(handle.absolutePath);
		}
		return handle;
	}
}

export class SharedCounterHandler extends OpHandler implements IRandomOpHandler {
    constructor(
        protected readonly channel: SharedCounter,
    ) {
		super(channel);
	}

	public async executeRandomNonHandleOp(): Promise<void> {
		this.channel.increment(this.random.integer(1, 10));
	}
}

export class SharedMapHandler extends HandleOpHandler implements IRandomOpHandler {
	constructor(
        protected readonly channel: SharedMap,
    ) {
		super(channel);
		this.removeHandleActions.push(async () => this.removeHandle());
	}

	public async executeRandomNonHandleOp(): Promise<void> {
		this.channel.set("NotAHandleOp", this.random.string(10));
	}

	protected async addHandle(handle: IFluidHandle): Promise<IFluidHandle | undefined> {
		// Only a handle should be added where we are using absolute paths.
		const oldHandle = this.channel.get(handle.absolutePath) as IFluidHandle;
		this.channel.set(handle.absolutePath, handle);
		return oldHandle;
	}

	private removeHandle(): IFluidHandle | undefined {
		const entries = Array.from(this.channel.entries());
		const handles = entries.filter((entry) => entry[0] !== "NotAHandleOp");
		const handleList = handles.map((entry) => entry[1] as IFluidHandle);
		if (handleList.length === 0) {
			return undefined;
		}
		const handle = this.random.pick(handleList);
		this.channel.delete(handle.absolutePath);
		return handle;
	}
}
