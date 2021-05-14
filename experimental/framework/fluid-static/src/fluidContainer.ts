/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { Container } from "@fluidframework/container-loader";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IEvent } from "@fluidframework/common-definitions";
import { LoadableObjectClass, LoadableObjectRecord } from "./types";
import { RootDataObject } from "./rootDataObject";
interface IFluidContainerEvents extends IEvent {
    (event: "connected", listener: (clientId: string) => void): void;
    (event: "dispose" | "disconnected", listener: () => void): void;
}

interface IFluidContainer {
    close(error?: ICriticalContainerError): void;
    readonly closed: boolean;
    readonly connected: boolean;
    initialObjects: LoadableObjectRecord;
}

export class FluidContainer extends TypedEventEmitter<IFluidContainerEvents> implements IFluidContainer {
    public constructor(
        private readonly container: Container,
        private readonly rootDataObject: RootDataObject,
    ) {
            super();
            container.on("connected", (id: string) =>  this.emit("connected", id));
            container.on("dispose", () =>  this.emit("dispose"));
            container.on("disconnected", () =>  this.emit("disconnected"));
    }

    public async create<T extends IFluidLoadable>(objectClass: LoadableObjectClass<T>): Promise<T> {
        return this.rootDataObject.create(objectClass);
    }

    public close() {
        this.container.close();
    }

    public get closed() {
        return this.container.closed;
    }

    public get connected() {
        return this.container.connected;
    }

    public get initialObjects() {
        return this.rootDataObject.initialObjects;
    }
}
