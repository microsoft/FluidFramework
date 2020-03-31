/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { SharedMap, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import { DdsCollectionComponent } from "./ddsCollection";

/**
 * Basic DDS examples using view interfaces and stock component classes.
 */
export class PrimitivesCollection extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private internalMapDir: IDirectory | undefined;
    protected get mapDir(): IDirectory { return this.tryGetDds(this.internalMapDir, "mapDir"); }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.internalMapDir = this.root.createSubDirectory("map");
    }

    protected async componentInitializingFromExisting() {
        this.internalMapDir = this.root.getSubDirectory("map");
    }

    /**
     * Render the primitives.
     */
    public render(div: HTMLElement) {
        const mapCreate = (name: string) => SharedMap.create(this.runtime, name);
        const mapListen = (listener: (changed: IDirectoryValueChanged) => void) => {
            this.root.on("valueChanged", (changed) => {
                if (changed.path !== this.mapDir.absolutePath) {
                    return;
                }
                listener(changed);
            });
        };
        const rerender = () => {
            ReactDOM.render(
                <div>
                    <DdsCollectionComponent mapDir={this.mapDir} mapCreate={mapCreate} listenValueChanged={mapListen}>
                    </DdsCollectionComponent>
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
