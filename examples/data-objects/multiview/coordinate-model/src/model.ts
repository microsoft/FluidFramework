/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IValueChanged } from "@fluidframework/map/legacy";

const xKey = "x";
const yKey = "y";

/**
 * The Coordinate is our implementation of the ICoordinate interface.
 * @internal
 */
export class Coordinate extends DataObject implements ICoordinate {
	public static readonly ComponentName = "@fluid-example/coordinate";

	public static getFactory(): DataObjectFactory<Coordinate> {
		return Coordinate.factory;
	}

	private static readonly factory = new DataObjectFactory(
		Coordinate.ComponentName,
		Coordinate,
		[],
		{},
	);

	protected async initializingFirstTime(): Promise<void> {
		this.root.set(xKey, 0);
		this.root.set(yKey, 0);
	}

	protected async hasInitialized(): Promise<void> {
		this.root.on("valueChanged", (changed: IValueChanged) => {
			if (changed.key === xKey || changed.key === yKey) {
				this.emit("coordinateChanged");
			}
		});
	}

	public get x(): number {
		return this.root.get(xKey) ?? 0;
	}

	public set x(newX: number) {
		this.root.set(xKey, newX);
	}

	public get y(): number {
		return this.root.get(yKey) ?? 0;
	}

	public set y(newY: number) {
		this.root.set(yKey, newY);
	}
}
