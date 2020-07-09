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

const coordinateListKey = "coordinates";

/**
 * The Polygon is our implementation of the IPolygon interface.
 */
export class Polygon extends PrimedComponent implements IPolygon {
    public static get ComponentName() { return "@fluid-example/polygon"; }

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
}

export const PolygonInstantiationFactory = new PrimedComponentFactory(
    Polygon.ComponentName,
    Polygon,
    [],
    {},
);
