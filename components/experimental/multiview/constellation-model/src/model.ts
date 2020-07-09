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

import { IConstellation, ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { Coordinate } from "@fluid-example/multiview-coordinate-model";

const starListKey = "stars";

/**
 * The Constellation is our implementation of the IConstellation interface.
 */
export class Constellation extends PrimedComponent implements IConstellation {
    public static get ComponentName() { return "@fluid-example/constellation"; }

    private _stars: ICoordinate[] = [];

    public static getFactory() {
        return Constellation.factory;
    }

    private static readonly factory = new PrimedComponentFactory(
        Constellation.ComponentName,
        Constellation,
        [],
        {},
        new Map([
            Coordinate.getFactory().registryEntry,
        ]),
    );

    protected async componentInitializingFirstTime() {
        this.root.set(starListKey, []);
    }

    protected async componentHasInitialized() {
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
        const existingStarHandles = this.root.get<IComponentHandle<ICoordinate>[]>(starListKey);
        const newStar: Coordinate = (await Coordinate.getFactory().createComponent(this.context)) as Coordinate;
        newStar.x = x;
        newStar.y = y;
        const newStars = [...existingStarHandles, newStar.handle];
        this.root.set(starListKey, newStars);
    }
}
