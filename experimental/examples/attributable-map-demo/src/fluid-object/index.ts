/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AttributableMap } from "@fluid-experimental/attributable-map";

export class AttributableMapPage extends DataObject {
	private readonly mapKey = "mapKey";

	private _map: AttributableMap | undefined;

	public get map() {
		if (this._map === undefined) {
			throw new Error("The AttributableMap was not initialized correctly");
		}
		return this._map;
	}

	public static get Name() {
		return "@fluid-example/attributable-map-demo";
	}

	private static readonly factory = new DataObjectFactory(
		AttributableMapPage.Name,
		AttributableMapPage,
		[AttributableMap.getFactory()],
		{},
	);

	public static getFactory() {
		return this.factory;
	}

	protected async initializingFirstTime() {
		// Create the AttributableMap and store the handle in our root SharedDirectory
		const map = AttributableMap.create(this.runtime);
		this.root.set(this.mapKey, map.handle);
	}

	protected async hasInitialized() {
		// Store the text if we are loading the first time or loading from existing
		this._map = await this.root.get<IFluidHandle<AttributableMap>>(this.mapKey)?.get();
	}
}
