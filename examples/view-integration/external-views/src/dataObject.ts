/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	FluidObject,
	IEvent,
	IEventProvider,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/legacy";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/legacy";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/legacy";
import { MapFactory, type ISharedMap, type IValueChanged } from "@fluidframework/map/legacy";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";

export interface IDiceRollerEvents extends IEvent {
	(event: "diceRolled", listener: () => void);
}

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IDiceRoller {
	readonly handle: IFluidHandle<FluidObject>;
	readonly events: IEventProvider<IDiceRollerEvents>;
	/**
	 * Get the dice value as a number.
	 */
	readonly value: number;

	/**
	 * Roll the dice.  Will cause a "diceRolled" event to be emitted.
	 */
	roll: () => void;
}

const mapId = "dice-map";
const mapFactory = new MapFactory();
const diceRollerSharedObjectRegistry = new Map<string, IChannelFactory>([
	[mapFactory.type, mapFactory],
]);

// We'll use this key for storing the value.
const diceValueKey = "diceValue";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
class DiceRoller implements IDiceRoller {
	public get value() {
		const value = this.map.get(diceValueKey);
		assert(typeof value === "number", "Bad dice value");
		return value;
	}

	private readonly _events = new TypedEventEmitter<IDiceRollerEvents>();
	public get events(): IEventProvider<IDiceRollerEvents> {
		return this._events;
	}

	public constructor(
		public readonly handle: IFluidHandle<FluidObject>,
		private readonly map: ISharedMap,
	) {
		this.map.on("valueChanged", (changed: IValueChanged) => {
			if (changed.key === diceValueKey) {
				// When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
				this._events.emit("diceRolled");
			}
		});
	}

	public readonly roll = () => {
		const rollValue = Math.floor(Math.random() * 6) + 1;
		this.map.set(diceValueKey, rollValue);
	};
}

export class DiceRollerFactory implements IFluidDataStoreFactory {
	public get type(): string {
		throw new Error("Do not use the type on the data store factory");
	}

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			diceRollerSharedObjectRegistry,
			existing,
			async () => instance,
		);

		let map: ISharedMap;
		if (existing) {
			map = (await runtime.getChannel(mapId)) as ISharedMap;
		} else {
			map = runtime.createChannel(mapId, mapFactory.type) as ISharedMap;
			map.set(diceValueKey, 1);
			map.bindToContext();
		}

		assert(runtime.entryPoint !== undefined, "EntryPoint was undefined");
		const handle = runtime.entryPoint;

		const instance = new DiceRoller(handle, map);

		return runtime;
	}
}
