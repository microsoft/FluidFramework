/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/legacy";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/legacy";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/legacy";
import { MapFactory, type ISharedMap, type IValueChanged } from "@fluidframework/map/legacy";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";

import type { IDiceRoller, IDiceRollerEvents } from "./interface.js";

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
		const provideEntryPoint = async (entryPointRuntime: IFluidDataStoreRuntime) => {
			const map = (await entryPointRuntime.getChannel(mapId)) as ISharedMap;
			return new DiceRoller(map);
		};

		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			diceRollerSharedObjectRegistry,
			existing,
			provideEntryPoint,
		);

		if (!existing) {
			const map = runtime.createChannel(mapId, mapFactory.type) as ISharedMap;
			map.set(diceValueKey, 1);
			map.bindToContext();
		}

		return runtime;
	}
}
