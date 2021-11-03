/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";
import { FluidDataStoreContext } from "./dataStoreContext";

export interface IRootDataStore extends IFluidRouter {
    trySetAlias(alias: string): Promise<boolean>;
}

export interface IDataStoreAliasMessage {
    readonly id: string;
    readonly alias: string;
}

export interface IDataStoreAliasMapping {
    readonly suppliedInternalId: string;
    readonly alias: string;
    readonly aliasedInternalId: string;
}

export class RootDataStore implements IRootDataStore {
    async trySetAlias(alias: string): Promise<boolean> {
        assert(this.dataStoreRuntime.attachState === AttachState.Attached, "Trying to submit message while detached!");

        const message: IDataStoreAliasMessage = {
            id: this.dataStoreRuntime.id,
            alias,
        };

        const aliasResult = await this.newAckBasedPromise<IDataStoreAliasMapping>((resolve) => {
            (this.dataStoreRuntime.context as FluidDataStoreContext).submitAliasOp(message, resolve);
        }).catch(() => undefined);

        return aliasResult?.aliasedInternalId === aliasResult?.suppliedInternalId;
    }

    async request(request: IRequest): Promise<IResponse> {
        return this.dataStoreRuntime.request(request);
    }

    constructor(private readonly dataStoreRuntime: FluidDataStoreRuntime) {}
    public get IFluidRouter() { return this.dataStoreRuntime; }


    // [TODO:andre4i]: Copied from SharedObject.
    // This needs to be extracted into a common package.
    private async newAckBasedPromise<T>(
        executor: (resolve: (value: T | PromiseLike<T>) => void,
        reject: (reason?: any) => void) => void,
    ): Promise<T> {
        let rejectBecauseDispose: () => void;
        return new Promise<T>((resolve, reject) => {
            rejectBecauseDispose =
                () => reject(new Error("FluidDataStoreRuntime disposed while this ack-based Promise was pending"));

            if (this.disposed) {
                rejectBecauseDispose();
                return;
            }

            this.on("dispose", rejectBecauseDispose);
            executor(resolve, reject);
        }).finally(() => {
            // Note: rejectBecauseDispose will never be undefined here
            this.off("dispose", rejectBecauseDispose);
        });
    }
}
