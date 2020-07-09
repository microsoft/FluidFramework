/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

const xKey = "x";
const yKey = "y";

/**
 * The Coordinate is our implementation of the ICoordinate interface.
 */
export class Coordinate extends PrimedComponent implements ICoordinate {
    public static get ComponentName() { return "@fluid-example/coordinate"; }

    public static getFactory() {
        return Coordinate.factory;
    }

    private static readonly factory = new PrimedComponentFactory(
        Coordinate.ComponentName,
        Coordinate,
        [],
        {},
    );

    protected async componentInitializingFirstTime() {
        this.root.set(xKey, 0);
        this.root.set(yKey, 0);
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === xKey || changed.key === yKey) {
                this.emit("coordinateChanged");
            }
        });
    }

    public get x() {
        return this.root.get(xKey);
    }

    public set x(newX: number) {
        this.root.set(xKey, newX);
    }

    public get y() {
        return this.root.get(yKey);
    }

    public set y(newY: number) {
        this.root.set(yKey, newY);
    }
}
