/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { TaskManager } from "@fluid-experimental/task-manager";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { ContainerSchema, IFluidContainer, SharedMap } from "fluid-framework";

import { IAzureAudience, AzureClient } from "@fluidframework/azure-client";
import { connectionConfig } from "./azureConfig";

const markedForRecoveryKey = "marked";
const recoveredKey = "recovered";

const agentContainerSchema = {
    initialObjects: {
        crc: ConsensusRegisterCollection,
        taskManager: TaskManager,
        containerInfo: SharedMap,
    },
};

const recoveryTaskName = "recoverTask";
const corruptedKey = "corrupted";
const orgContainerKey = "originalContainerId";
const recoveredContainerKey = "recoveredContainerId";
const recoveredByKey = "recoveredBy";

export type ContainerSetupCb = (container: IFluidContainer) => void;
export type RecoveryStatus =
    | "NotStarted"
    | "KickedOff"
    | "Success"
    | "Error"
    | "Skipped";

export interface RecoveryInfo {
    originalContainerId: string;
    isContainerCorrupted?: boolean;
    agentId: string;
    recoveredContainerId?: string;
    recoveryStatus?: RecoveryStatus;
    recoveryLog: string;
    recoveredBy?: string;
    isContainerRecovered: boolean;
}

export class RecoveryAgent extends EventEmitter {
    private readonly _crc: ConsensusRegisterCollection<boolean>;
    private readonly _taskManager: TaskManager;
    private readonly _recoveryInfo: SharedMap;
    private readonly _orgContainerId?: string;
    // private readonly _azureClient: AzureClient;
    private _recoveryLog: string;
    private _recoveryStatus: RecoveryStatus;

    constructor(
        private readonly agentId: string,
        // private readonly orgContainerSchema: ContainerSchema,
        private readonly recoveryContainer: IFluidContainer,
        private readonly audience: IAzureAudience,
    ) {
        super();

        // const clientProps = {
        //    connection: connectionConfig,
        // };
        // this._azureClient = new AzureClient(clientProps);

        this._recoveryInfo = this.recoveryContainer.initialObjects
            .containerInfo as SharedMap;
        this._orgContainerId = this._recoveryInfo.get<string>(orgContainerKey);

        this._crc = this.recoveryContainer.initialObjects
            .crc as ConsensusRegisterCollection<boolean>;
        this._taskManager = this.recoveryContainer.initialObjects
            .taskManager as TaskManager;

        this._recoveryLog = "";
        this._recoveryStatus = "NotStarted";

        this._recoveryInfo.on("valueChanged", (changed) => {
            this.emit("recoveryInfoChanged");

            // Explicit corruption signalling
            if (changed.key === corruptedKey) {
                this.emit("containerCorrupted");
            }
        });
    }

    /**
     * Creates a new recovery agent for container ID.
     * @param containerId - Id of the container for which we want to manage recovery
     * @returns ID of the recovery agent
     */
    public static async createRecoveryAgent(
        containerId: string,
    ): Promise<string> {
        const clientProps = {
            connection: connectionConfig,
        };
        const client = new AzureClient(clientProps);
        const c = await client.createContainer(agentContainerSchema);

        const containerInfo = c.container.initialObjects
            .containerInfo as SharedMap;
        const crc = c.container.initialObjects
            .crc as ConsensusRegisterCollection<boolean>;

        await Promise.all([
            containerInfo.set(corruptedKey, false),
            containerInfo.set(orgContainerKey, containerId),
            containerInfo.set(recoveredContainerKey, ""),
            containerInfo.set(recoveredByKey, ""),
            crc.write(markedForRecoveryKey, false),
            crc.write(recoveredKey, false),
        ]);

        return c.container.attach();
    }

    public static async getRecoveryAgent(
        agentId: string,
        containerSchema: ContainerSchema,
    ): Promise<RecoveryAgent> {
        const clientProps = {
            connection: connectionConfig,
        };
        const client = new AzureClient(clientProps);
        const c = await client.getContainer(agentId, agentContainerSchema);

        return new RecoveryAgent(
            agentId,
            // containerSchema,
            c.container,
            c.services.audience,
        );
    }

    public get getRecoveryInfo(): RecoveryInfo {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!this._orgContainerId) {
            throw new Error("Cannot retreive status: Missing container ID.");
        }

        return {
            originalContainerId: this._orgContainerId,
            isContainerCorrupted: this._recoveryInfo.get<boolean>(corruptedKey),
            agentId: this.agentId,
            recoveryStatus: this._recoveryStatus,
            isContainerRecovered: this.recovered,
            recoveryLog: this._recoveryLog,
            recoveredContainerId: this._recoveryInfo.get<string>(
                recoveredContainerKey,
            ),
            recoveredBy: this._recoveryInfo.get<string>(recoveredByKey),
        };
    }

    public get recoveredContainerId(): string | undefined {
        return this._recoveryInfo.get<string>(recoveredContainerKey);
    }

    /* Simulated corruption */

    public markCorrupted(): void {
        this._recoveryInfo.set(corruptedKey, true);
    }

    /* Recovery */

    public async recoverDoc(cb: ContainerSetupCb): Promise<string | undefined> {
        this.setRecoveryStatus("KickedOff");
        this.log("Kicked off recovery.");

        if (!this.markedForRecovery) {
            this.log("Marked for forecovery.");
            await this.markForRecovery();
        }

        if (this.recovered) {
            this.setRecoveryStatus("Skipped");
            this.log("Doc already recovered!");
            return this.recoveredContainerId;
        }

        this.log("Volonteering for recovery");
        await this.volunteerForRecovery();
        if (this.recovered) {
            this.releaseRecoveryTask();
            this.setRecoveryStatus("Skipped");
            this.log("We volonteered, but doc already recovered!");
            return this.recoveredContainerId;
        }

        const fluidContainer = await this.recoverContainer();
        if (!fluidContainer) {
            this.releaseRecoveryTask();
            this.setRecoveryStatus("Error");
            this.log("Could not recover container.");
            throw new Error("Lost task during write");
        }

        cb(fluidContainer);

        const id = await fluidContainer.attach();
        this._recoveryInfo.set(recoveredContainerKey, id);

        if (!this.haveRecoveryTask()) {
            this.setRecoveryStatus("Error");
            this.log("Lock error during recovery.");
            throw new Error("Lost task during write");
        }

        await this.setRecovered();
        this.setRecoveryStatus("Success");
        this.log("This client recovered container.");
        this.releaseRecoveryTask();
        return this.recoveredContainerId;
    }

    private async volunteerForRecovery(): Promise<void> {
        return this._taskManager.lockTask(recoveryTaskName);
    }

    private haveRecoveryTask(): boolean {
        return this._taskManager.haveTaskLock(recoveryTaskName) ?? false;
    }

    private releaseRecoveryTask() {
        return this._taskManager.abandon(recoveryTaskName);
    }

    private get recovered() {
        return this._crc.read(recoveredKey) as boolean;
    }

    private async setRecovered() {
        // Using a consensus-type data structure here, to make it easier to validate
        // that the setRecovered was ack'd and we can have confidence other clients will agree.
        await this._crc.write(recoveredKey, true);
    }

    private get markedForRecovery() {
        return this._crc.read(markedForRecoveryKey) as boolean;
    }

    private async markForRecovery() {
        await this._crc.write(markedForRecoveryKey, true);
    }

    private async recoverContainer(): Promise<IFluidContainer | undefined> {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!this._orgContainerId) {
            throw new Error("Cannot recover doc: Missing container ID.");
        }

        const self = this.audience.getMyself();
        this._recoveryInfo.set(recoveredByKey, self?.userId);

        /*
        // Todo: Integrate with new API
        const id = this._recoveryInfo.get(orgContainerKey);
        const versions = await this._azureClient.getContainerVersions(id, maxVersions);
        const { container: newContainer } =
            await this._azureClient.recreateContainerFromVersion(
                this._orgContainerId,
                this.orgContainerSchema,
                versions[0]
            );
        return newContainer;
        */
        return undefined;
    }

    /* Log */

    private log(msg: string): void {
        this._recoveryLog = msg;
        this.emit("recoveryInfoChanged");
    }

    private setRecoveryStatus(status: RecoveryStatus): void {
        this._recoveryStatus = status;
        this.emit("recoveryInfoChanged");
    }
}
