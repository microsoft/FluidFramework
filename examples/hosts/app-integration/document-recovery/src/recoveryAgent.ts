/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ContainerSchema, SharedMap } from "fluid-framework";
import {
    AzureClient,
    AzureContainerVersion,
} from "@fluidframework/azure-client";
import { connectionConfig } from "./azureConfig";
import { counterValueKey } from "./dataController";

export type RecoveryStatus =
    | "NotStarted"
    | "KickedOff"
    | "Success"
    | "Error"
    | "Cancelled";

export interface RecoveryInfo {
    originalContainerId: string;
    isContainerRecovered?: boolean;
    recoveredContainerId?: string;
    recoveryStatus?: RecoveryStatus;
    recoveryLog: string;
}

export class RecoveryAgent extends EventEmitter {
    private readonly azureClient: AzureClient;
    private readonly maxDocVersions = 5;
    private recoveryLog: string;
    private recoveryStatus: RecoveryStatus;
    public recoveredContainerId: string | undefined;

    constructor(
        private readonly orgContainerId: string,
        private readonly orgContainerSchema: ContainerSchema,
    ) {
        super();
        const clientProps = {
            connection: connectionConfig,
        };
        this.azureClient = new AzureClient(clientProps);
        this.recoveredContainerId = undefined;
        this.recoveryLog = "";
        this.recoveryStatus = "NotStarted";
    }

    public static createRecoveryAgent(
        containerId: string,
        containerSchema: ContainerSchema,
    ): RecoveryAgent {
        return new RecoveryAgent(containerId, containerSchema);
    }

    public get getRecoveryInfo(): RecoveryInfo {
        if (!this.orgContainerId) {
            throw new Error("Cannot retreive status: Missing container ID.");
        }

        return {
            originalContainerId: this.orgContainerId,
            recoveryStatus: this.recoveryStatus,
            recoveryLog: this.recoveryLog,
            recoveredContainerId: this.recoveredContainerId,
        };
    }

    public async startRecovery(): Promise<void> {
        Promise.race([
            this.recoverDoc(),
            new Promise((_resolve, reject) =>
                setTimeout(() => reject(new Error("timeout")), 1000),
            ),
        ]).then((val) => {
            this.recoveredContainerId = val as string;
            this.setRecoveryStatus(
                "Success",
                "Document succesfully recreated.",
            );
        }).catch((err) => {
            this.setRecoveryStatus(
                "Error",
                err,
            );
        });
    }

    // Waiting on PR #9729  to expose getContainerVersions and recreateContainerFromVersion
    private async recoverDoc(): Promise<string> {
        this.setRecoveryStatus("KickedOff", "Kicked off recovery.");

        /* Collect doc versions */
        let versions: AzureContainerVersion[] = [];
        try {
            versions = await this.azureClient.getContainerVersions(
                this.orgContainerId,
                {
                    maxCount: this.maxDocVersions,
                },
            );
        } catch (e) {
            return Promise.reject(new Error("Unable to get container versions."));
        }

        for (const version of versions) {
            /* Attempt to copy doc from next available version of the older doc */
            try {
                const { container: newContainer } =
                    await this.azureClient.copyContainer(
                        this.orgContainerId,
                        this.orgContainerSchema,
                        version,
                    );
                const id = await newContainer.attach();

                // FF Data may be lazy loaded on views. Fetch it now to ensure it's
                // not currupted.
                const sharedMap = newContainer.initialObjects.dataMap as SharedMap;
                const value = sharedMap.get(counterValueKey);
                if (typeof value !== "number") {
                    throw new Error(
                        "Model is incorrect - invalid data",
                    );
                }
                return id;
            } catch (e) {
                this.setRecoveryStatus(
                    "Error",
                    `Error while recreating document from version ${version}`,
                );
            }
        }

        return Promise.reject(new Error("Could not recreate document"));
    }

    private setRecoveryStatus(status: RecoveryStatus, msg: string): void {
        this.recoveryStatus = status;
        this.recoveryLog = msg;
        this.emit("recoveryInfoChanged");
    }
}
