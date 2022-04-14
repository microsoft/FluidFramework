/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerInstantiationFactory, Clicker, ClickerReactView } from "@fluid-example/clicker";
import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import React from "react";

const simpleFluidObjectEmbedName = "@fluid-example/simple-fluidobject-embed";

export class SimpleFluidObjectEmbed extends DataObject {
    private _clicker: Clicker | undefined;
    public get clicker(): Clicker {
        if (this._clicker === undefined) {
            throw new Error("Clicker accessed before initialized");
        }
        return this._clicker;
    }

    /**
   * This is only run the first time a document is created
   * Here we will create a new embedded Fluid object. This can happen at any time
   * but in this scenario we only want it to be created once.
   */
    protected async initializingFirstTime() {
        const fluidObject = await ClickerInstantiationFactory.createChildInstance(this.context);
        this.root.set("myEmbeddedCounter", fluidObject.handle);
    }

    /**
   * Get Clicker using ID from before
   */
    protected async hasInitialized() {
        const handle = this.root.get("myEmbeddedCounter");
        this._clicker = await handle.get();
    }
}

export const SimpleFluidObjectEmbedInstantiationFactory = new DataObjectFactory(
    simpleFluidObjectEmbedName,
    SimpleFluidObjectEmbed,
    [],
    {},
    new Map([
        ClickerInstantiationFactory.registryEntry,
    ]),
);

const viewCallback = (model: SimpleFluidObjectEmbed) => <ClickerReactView clicker={ model.clicker } />;

/**
 * This does setup for the Container. The ContainerViewRuntimeFactory will instantiate a single Fluid object to use
 * as our model (using the factory we provide), and the view callback we provide will pair that model with an
 * appropriate view.
 */
export const fluidExport = new ContainerViewRuntimeFactory(SimpleFluidObjectEmbedInstantiationFactory, viewCallback);
