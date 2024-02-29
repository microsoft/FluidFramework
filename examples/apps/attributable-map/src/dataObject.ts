/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { AttributableMap } from "@fluid-experimental/attributable-map";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export const greenKey = "green";
export const redKey = "red";

/**
 * ITinyliciousUser describes the default format for users created through the Tinylicious server.
 * However, the specific details for a user may differ depending on the server.
 */
export interface ITinyliciousUser {
	id: string;
	name: string;
}

/**
 * IHitCounter describes the public API surface for hit counter data object.
 */
export interface IHitCounter extends EventEmitter {
	/**
	 * The attributable map to store timestamp key and value
	 */
	readonly map: AttributableMap | undefined;

	/**
	 * Inrement the hit count. Will cause a "hit" event to be emitted.
	 */
	hit: (color: string) => void;

	/**
	 * The hit event will fire whenever someone click the hit button, either locally or remotely.
	 */
	on(event: "hit", listener: () => void): this;
}

export class HitCounter extends DataObject implements IHitCounter {
	private readonly mapKey = "mapKey";
	private _map: AttributableMap | undefined;

	public get map() {
		if (this._map === undefined) {
			throw new Error("The AttributableMap was not initialized correctly");
		}
		return this._map;
	}

	public static readonly Name = "@fluid-example/attributable-map";

	private static readonly factory = new DataObjectFactory(
		HitCounter.Name,
		HitCounter,
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
		map.set(greenKey, 0);
		map.set(redKey, 0);
		this.root.set(this.mapKey, map.handle);
	}

	protected async hasInitialized() {
		// Store the content if we are loading the first time or loading from existing
		this._map = await this.root.get<IFluidHandle<AttributableMap>>(this.mapKey)?.get();
		this.map.on("valueChanged", () => {
			this.emit("hit");
		});
	}

	public readonly hit = (color) => {
		const oldValue = this.map.get(color);
		const newValue = Number(oldValue) + 1;
		this.map?.set(color, newValue);
	};
}
