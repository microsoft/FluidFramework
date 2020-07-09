/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

/**
 * ICoordinate describes the public API surface for our 2d coordinate component.
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
 * IPolygon describes the public API surface for our polygon component.
 */
export interface IPolygon extends EventEmitter {
    coordinates: ICoordinate[];

    addCoordinate(x: number, y: number): Promise<void>;

    /**
     * The polygonChanged event will fire whenever someone changes any coordinate, either locally or remotely.
     */
    on(event: "polygonChanged", listener: () => void): this;
}
