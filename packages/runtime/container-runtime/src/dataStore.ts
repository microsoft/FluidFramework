/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ContainerRuntime } from "./containerRuntime";

export interface IDataStore extends IFluidRouter {
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

export class DataStore implements IDataStore {
    async trySetAlias(alias: string): Promise<boolean> {
        assert(this.runtime.attachState === AttachState.Attached, "Trying to submit message while detached!");

        const message: IDataStoreAliasMessage = {
            id: this.internalId,
            alias,
        };

        const aliasResult = await this.newAckBasedPromise<IDataStoreAliasMapping>((resolve) => {
            this.runtime.submitDataStoreAliasOp(message, resolve);
        }).catch(() => undefined);

        return aliasResult !== undefined && aliasResult.aliasedInternalId === aliasResult.suppliedInternalId;
    }

    async request(request: IRequest): Promise<IResponse> {
        return this.router.request(request);
    }

    constructor(
        private readonly router: IFluidRouter,
        private readonly internalId: string,
        private readonly runtime: ContainerRuntime,
    ) { }
    public get IFluidRouter() { return this.router; }

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

            if (this.runtime.disposed) {
                rejectBecauseDispose();
                return;
            }

            this.runtime.on("dispose", rejectBecauseDispose);
            executor(resolve, reject);
        }).finally(() => {
            // Note: rejectBecauseDispose will never be undefined here
            this.runtime.off("dispose", rejectBecauseDispose);
        });
    }
}
