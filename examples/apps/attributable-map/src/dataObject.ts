/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { AttributableMap } from "@fluid-experimental/attributable-map";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export const greenKey = "green";
export const redKey = "red";

export interface ITinyliciousUser {
	id: string;
	name: string;
}

/**
 * ITimestampWatcher describes the public API surface for our time stamp data object.
 */
export interface ITimestampWatcher extends EventEmitter {
	/**
	 * The attributable map to store timestamp key and value
	 */
	readonly map: AttributableMap | undefined;

	/**
	 * Refresh the timestamp. Will cause a "timeRefresh" event to be emitted.
	 */
	refresh: (color: string) => void;

	/**
	 * The timeRefresh event will fire whenever someone click the refresh button, either locally or remotely.
	 */
	on(event: "timeRefresh", listener: () => void): this;
}

export class TimestampWatcher extends DataObject implements ITimestampWatcher {
	private readonly mapKey = "mapKey";
	private _map: AttributableMap | undefined;

	public get map() {
		if (this._map === undefined) {
			throw new Error("The AttributableMap was not initialized correctly");
		}
		return this._map;
	}

	public static get Name() {
		return "@fluid-example/attributable-map";
	}

	private static readonly factory = new DataObjectFactory(
		TimestampWatcher.Name,
		TimestampWatcher,
		[AttributableMap.getFactory()],
		{},
	);

	public static getFactory() {
		return this.factory;
	}

	protected async initializingFirstTime() {
		// Create the AttributableMap and store the handle in our root SharedDirectory
		const map = AttributableMap.create(this.runtime);
		// set the initial value
		// const attribution = map.getAttribution(timeKey);
		// const timestamp = new Date(Date.now());
		// const newValue = { time: timestamp.toUTCString(), attribution };
		// map.set(timeKey, newValue);
		map.set(greenKey, 0);
		map.set(redKey, 0);
		this.root.set(this.mapKey, map.handle);
		// this.emit("timeRefresh");
	}

	protected async hasInitialized() {
		// Store the text if we are loading the first time or loading from existing
		this._map = await this.root.get<IFluidHandle<AttributableMap>>(this.mapKey)?.get();
		this._map?.on("valueChanged", () => {
			this.emit("timeRefresh");
		});
	}

	public readonly refresh = (color) => {
		// const attribution = this._map?.getAttribution(timeKey);
		// const timestamp = new Date(Date.now());
		// const newValue = { time: timestamp.toUTCString(), attribution };
		// this._map?.set(timeKey, newValue);
		const oldValue = this._map?.get(color);
		const newValue = Number(oldValue) + 1;
		this._map?.set(color, newValue);
	};
}
