/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";
import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

const xKey = "x";
const yKey = "y";

/**
 * The Coordinate is our implementation of the ICoordinate interface.
 */
export class Coordinate extends DataObject implements ICoordinate {
    public static get ComponentName() { return "@fluid-example/coordinate"; }

    public static getFactory() {
        return Coordinate.factory;
    }

    private static readonly factory = new DataObjectFactory(
        Coordinate.ComponentName,
        Coordinate,
        [],
        {},
    );

    protected async initializingFirstTime() {
        this.root.set(xKey, 0);
        this.root.set(yKey, 0);
    }

    protected async hasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === xKey || changed.key === yKey) {
                this.emit("coordinateChanged");
            }
        });
    }

    public get x() {
        return this.root.get(xKey) ?? 0;
    }

    public set x(newX: number) {
        this.root.set(xKey, newX);
    }

    public get y() {
        return this.root.get(yKey) ?? 0;
    }

    public set y(newY: number) {
        this.root.set(yKey, newY);
    }
}
