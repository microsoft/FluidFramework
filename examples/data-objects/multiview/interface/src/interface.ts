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
 * IConstellation describes the public API surface for our Constellation component.
 */
export interface IConstellation extends EventEmitter {
    stars: ICoordinate[];

    addStar(x: number, y: number): Promise<void>;

    /**
     * The constellationChanged event will fire whenever someone changes any star, either locally or remotely.
     */
    on(event: "constellationChanged", listener: () => void): this;
}
