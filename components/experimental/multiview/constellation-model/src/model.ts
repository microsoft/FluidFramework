/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IValueChanged } from "@fluidframework/map";

import { IConstellation, ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";

const starListKey = "stars";

/**
 * The Constellation is our implementation of the IConstellation interface.
 */
export class Constellation extends DataObject implements IConstellation {
    public static get ComponentName() { return "@fluid-example/constellation"; }

    private _stars: ICoordinate[] = [];

    public static getFactory() {
        return Constellation.factory;
    }

    private static readonly factory = new DataObjectFactory(
        Constellation.ComponentName,
        Constellation,
        [],
        {},
        new Map([
            Coordinate.getFactory().registryEntry,
        ]),
    );

    protected async initializingFirstTime() {
        this.root.set(starListKey, []);
    }

    protected async hasInitialized() {
        await this.updateStarsFromRoot();
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === starListKey) {
                this.updateStarsFromRoot()
                    .then(() => this.emit("constellationChanged"))
                    .catch((error) => console.error(error));
            }
        });
    }

    public get stars() {
        return this._stars;
    }

    private async updateStarsFromRoot() {
        const starHandles = this.root.get<IComponentHandle<ICoordinate>[]>(starListKey);
        this._stars = await Promise.all(starHandles.map(async (starHandle) => starHandle.get()));
    }

    public async addStar(x: number, y: number): Promise<void> {
        const starHandles = this.root.get<IComponentHandle<ICoordinate>[]>(starListKey);
        const newStar: Coordinate = (await Coordinate.getFactory()._createDataStore(this.context)) as Coordinate;
        newStar.x = x;
        newStar.y = y;
        starHandles.push(newStar.handle);
        this.root.set(starListKey, starHandles);
    }
}
