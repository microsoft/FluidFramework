/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-example/example-utils";

/**
 * ICoordinate describes the public API surface for our 2d coordinate component.
 * @internal
 */
export interface ICoordinate extends EventEmitter {
	x: number;
	y: number;

	/**
	 * The coordinateChanged event will fire whenever someone changes the coordinate, either locally or remotely.
	 */
	on(event: "coordinateChanged", listener: () => void): this;
}

/**
 * IConstellation describes the public API surface for our Constellation component.
 * @internal
 */
export interface IConstellation extends EventEmitter {
	stars: ICoordinate[];

	addStar(x: number, y: number): Promise<void>;

	/**
	 * The constellationChanged event will fire whenever someone changes any star, either locally or remotely.
	 */
	on(event: "constellationChanged", listener: () => void): this;
}
