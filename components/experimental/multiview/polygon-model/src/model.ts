/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IValueChanged } from "@fluidframework/map";

import { IPolygon, ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";

const coordinateListKey = "coordinates";

/**
 * The Polygon is our implementation of the IPolygon interface.
 */
export class Polygon extends PrimedComponent implements IPolygon {
    public static get ComponentName() { return "@fluid-example/polygon"; }

    private _coordinates: ICoordinate[] = [];

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
        await this.updateCoordinatesFromRoot();
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === coordinateListKey) {
                this.updateCoordinatesFromRoot()
                    .then(() => this.emit("polygonChanged"))
                    .catch((error) => console.error(error));
            }
        });
    }

    public get coordinates() {
        return this._coordinates;
    }

    private async updateCoordinatesFromRoot() {
        const coordHandles = this.root.get<IComponentHandle<ICoordinate>[]>(coordinateListKey);
        this._coordinates = await Promise.all(coordHandles.map(async (coordHandle) => coordHandle.get()));
    }

    public async addCoordinate(x: number, y: number): Promise<void> {
        const existingCoordHandles = this.root.get<IComponentHandle<ICoordinate>[]>(coordinateListKey);
        const newCoordinate: Coordinate = (await Coordinate.getFactory().createComponent(this.context)) as Coordinate;
        newCoordinate.x = x;
        newCoordinate.y = y;
        const newCoordinates = [...existingCoordHandles, newCoordinate.handle];
        this.root.set(coordinateListKey, newCoordinates);
    }
}
