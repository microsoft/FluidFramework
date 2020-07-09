/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";

import { IPolygon } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";

const coordinateListKey = "coordinates";

/**
 * The Polygon is our implementation of the IPolygon interface.
 */
export class Polygon extends PrimedComponent implements IPolygon {
    public static get ComponentName() { return "@fluid-example/polygon"; }

    public static getFactory() {
        return Polygon.factory;
    }

    private static readonly factory = new PrimedComponentFactory(
        Polygon.ComponentName,
        Polygon,
        [],
        {},
        new Map([
            Coordinate.getFactory().registryEntry,
        ]),
    );

    protected async componentInitializingFirstTime() {
        this.root.set(coordinateListKey, []);
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === coordinateListKey) {
                this.emit("polygonChanged");
            }
        });
    }

    public get coordinates() {
        return this.root.get(coordinateListKey);
    }

    public async addCoordinate(x: number, y: number): Promise<void> {
        const newCoordinate: Coordinate = (await Coordinate.getFactory().createComponent(this.context)) as Coordinate;
        newCoordinate.x = x;
        newCoordinate.y = y;
        const newCoordinates = [...this.coordinates, newCoordinate];
        this.root.set(coordinateListKey, newCoordinates);
    }
}
