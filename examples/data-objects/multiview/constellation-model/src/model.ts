/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IValueChanged } from "@fluidframework/map";

import { IConstellation, ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";

const starListKey = "stars";
const constellationName = "@fluid-example/constellation";

/**
 * The Constellation is our implementation of the IConstellation interface.
 */
export class Constellation extends DataObject implements IConstellation {
    private _stars: ICoordinate[] = [];

    public static getFactory() {
        return Constellation.factory;
    }

    private static readonly factory = new DataObjectFactory(
        constellationName,
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const starHandles = this.root.get<IFluidHandle<ICoordinate>[]>(starListKey)!;
        this._stars = await Promise.all(starHandles.map(async (starHandle) => starHandle.get()));
    }

    public async addStar(x: number, y: number): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const starHandles = this.root.get<IFluidHandle<ICoordinate>[]>(starListKey)!;
        const newStar = await Coordinate.getFactory().createChildInstance(this.context);
        newStar.x = x;
        newStar.y = y;
        starHandles.push(newStar.handle);
        this.root.set(starListKey, starHandles);
    }
}
