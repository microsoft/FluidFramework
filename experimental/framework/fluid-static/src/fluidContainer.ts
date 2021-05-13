/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { Container } from "@fluidframework/container-loader";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IEvent } from "@fluidframework/common-definitions";
import { LoadableObjectClass } from "./types";
import { RootDataObject } from "./rootDataObject";

interface IFluidContainerEvents extends IEvent {
    (event: "connected", listener: (clientId: string) => void): void;
}

interface IFluidContainer {
    close: Container["close"];
    closed: Container["closed"];
    connected: Container["connected"];
    initialObjects: RootDataObject["initialObjects"];
}

export class FluidContainer extends TypedEventEmitter<IFluidContainerEvents> implements IFluidContainer {
    private readonly _container: Container;
    private readonly _rootDataObject: RootDataObject;

    public constructor(
        readonly container: Container,
        readonly rootDataObject: RootDataObject,
    ) {
            super();
            this._container = container;
            this._rootDataObject = rootDataObject;
            container.on("connected", (id: string) =>  this.emit("connected", id));
    }

    static async load(container: Container): Promise<FluidContainer> {
        const rootDataObject = (await container.request({ url: "/" })).value;
        return new FluidContainer(container, rootDataObject);
    }

    public async create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T> {
        return this._rootDataObject.create(objectClass);
    }

    public close() {
        this._container.close();
    }

    public get closed() {
        return this._container.closed;
    }

    public get connected() {
        return this._container.connected;
    }

    public get initialObjects() {
        return this._rootDataObject.initialObjects;
    }
}
