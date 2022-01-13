/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { ContainerRuntime } from "./containerRuntime";

/**
 * Interface for an op to be used for assigning an
 * alias to a datastore
 */
export interface IDataStoreAliasMessage {
    /** The internal id of the datastore */
    readonly internalId: string;
    /** The alias name to be assigned to the datastore */
    readonly alias: string;
}

/**
 * Type guard that returns true if the given alias message is actually an instance of
 * a class which implements @see IDataStoreAliasMessage
 * @param maybeDataStoreAliasMessage - message object to be validated
 * @returns True if the @see IDataStoreAliasMessage is fully implemented, false otherwise
 */
 export const isDataStoreAliasMessage = (
    maybeDataStoreAliasMessage: any,
): maybeDataStoreAliasMessage is IDataStoreAliasMessage => {
    return typeof maybeDataStoreAliasMessage?.internalId === "string"
        && typeof maybeDataStoreAliasMessage?.alias === "string";
};

/**
 * A fluid router with the capability of being assigned an alias
 */
 export interface IDataStore extends IFluidRouter {
    /**
     * Attempt to assign an alias to the datastore.
     * If the operation succeeds, the datastore can be referenced
     * by the supplied alias.
     *
     * @param alias - Given alias for this datastore.
     */
    trySetAlias(alias: string): Promise<boolean>;
}

export const channelToDataStore = (
    fluidDataStoreChannel: IFluidDataStoreChannel,
    internalId: string,
    runtime: ContainerRuntime,
    logger: ITelemetryLogger,
): IDataStore => new DataStore(fluidDataStoreChannel, internalId, runtime, logger);

class DataStore implements IDataStore {
    async trySetAlias(alias: string): Promise<boolean> {
        assert(this.runtime.attachState === AttachState.Attached, "Trying to submit message while detached!");

        this.fluidDataStoreChannel.bindToContext();

        const message: IDataStoreAliasMessage = {
            internalId: this.internalId,
            alias,
        };

        return this.ackBasedPromise<boolean>((resolve) => {
            this.runtime.submitDataStoreAliasOp(message, resolve);
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "AliasingException" }, error);
            return false;
        });
    }

    async request(request: IRequest): Promise<IResponse> {
        return this.fluidDataStoreChannel.request(request);
    }

    constructor(
        private readonly fluidDataStoreChannel: IFluidDataStoreChannel,
        private readonly internalId: string,
        private readonly runtime: ContainerRuntime,
        private readonly logger: ITelemetryLogger,
    ) { }
    public get IFluidRouter() { return this.fluidDataStoreChannel; }

    private async ackBasedPromise<T>(
        executor: (resolve: (value: T | PromiseLike<T>) => void,
        reject: (reason?: any) => void) => void,
    ): Promise<T> {
        let rejectBecauseDispose: () => void;
        return new Promise<T>((resolve, reject) => {
            rejectBecauseDispose =
                () => reject(new Error("ContainerRuntime disposed while this ack-based Promise was pending"));

            if (this.runtime.disposed) {
                rejectBecauseDispose();
                return;
            }

            this.runtime.on("dispose", rejectBecauseDispose);
            executor(resolve, reject);
        }).finally(() => {
            this.runtime.off("dispose", rejectBecauseDispose);
        });
    }
}
