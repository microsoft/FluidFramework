/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
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
	/**
	 * Object that events for changes to the dice value.
	 */
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

// This key is where we store the value in the ISharedMap.
const diceValueKey = "dice-value";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
class DiceRoller implements IDiceRoller {
	private readonly _events = new TypedEventEmitter<IDiceRollerEvents>();
	public get events(): IEventProvider<IDiceRollerEvents> {
		return this._events;
	}

	public constructor(private readonly map: ISharedMap) {
		this.map.on("valueChanged", (changed: IValueChanged) => {
			if (changed.key === diceValueKey) {
				this._events.emit("diceRolled");
			}
		});
	}

	public get value() {
		const value = this.map.get(diceValueKey);
		assert(typeof value === "number", "Bad dice value");
		return value;
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

		const instance = new DiceRoller(map);

		return runtime;
	}
}
