/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { IAudience } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { RootDataObject } from "./rootDataObject";

export class FluidContainer
    extends EventEmitter
    implements
        Pick<Container, "audience" | "clientId" | "close" | "closed" | "connected" >,
        Pick<RootDataObject, "initialObjects"> {
    private readonly _container: Container | undefined = undefined;
    private readonly _rootDataObject: RootDataObject | undefined = undefined;

    public constructor(container: Container, dataObject: RootDataObject) {
            super();
            this._container = container;
            this._rootDataObject = dataObject;

            container.on("connected", (id: string) =>  this.emit("connected", id));
    }

    private get container(): Container {
        assert(this._container !== undefined, "container undefined");
        return this._container;
    }

    private get rootDataObject(): RootDataObject {
        assert(this._rootDataObject !== undefined, "defaultObject undefined");
        return this._rootDataObject;
    }

    public close() {
        this.container.close();
    }

    public get initialObjects() {
        return this.rootDataObject.initialObjects;
    }

    public get closed() {
        return this.container.closed;
    }

    public get connected() {
        return this.container.connected;
    }

    public get audience(): IAudience {
        return this.container.audience;
    }

    public get clientId() {
        return this.container.clientId;
    }
}
