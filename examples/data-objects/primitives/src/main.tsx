/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
} from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { SharedMap, IDirectory } from "@fluidframework/map";
import { DdsCollectionComponent } from "./ddsCollection";

export const PrimitivesName = "PrimitivesCollection";

/**
 * Basic DDS examples using view interfaces and stock component classes.
 */
export class PrimitivesCollection extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private internalMapDir: IDirectory | undefined;
    protected get mapDir(): IDirectory { return this.tryGetDds(this.internalMapDir, "mapDir"); }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async initializingFirstTime() {
        this.internalMapDir = this.root.createSubDirectory("map");
    }

    protected async initializingFromExisting() {
        this.internalMapDir = this.root.getSubDirectory("map");
    }

    /**
     * Render the primitives.
     */
    public render(div: HTMLElement) {
        const mapCreate = (name: string) => SharedMap.create(this.runtime, name);
        const rerender = () => {
            ReactDOM.render(
                <div>
                    <DdsCollectionComponent mapDir={this.mapDir} mapCreate={mapCreate} />
                </div>,
                div,
            );
        };

        rerender();
    }

    private tryGetDds<T>(dds: T | undefined, id: string): T {
        if (dds === undefined) {
            throw Error(`${id} must be initialized before being accessed.`);
        }
        return dds;
    }
}
