/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskManager } from "@fluid-experimental/task-manager";
import { Quorum } from "@fluid-internal/quorum";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";

import type { IContainerKillBit } from "./interfaces";

const quorumKey = "quorum";
const crcKey = "crc";
const taskManagerKey = "task-manager";
const codeDetailsProposedKey = "code";
const migrateTaskName = "migrate";
const newContainerIdKey = "newContainerId";

export class ContainerKillBit extends DataObject implements IContainerKillBit {
    private _quorum: Quorum | undefined;
    private _crc: ConsensusRegisterCollection<string> | undefined;
    private _taskManager: TaskManager | undefined;
    private _newContainerId: string | undefined;

    private get quorum() {
        if (this._quorum === undefined) {
            throw new Error("Couldn't retrieve the Quorum");
        }
        return this._quorum;
    }

    private get crc() {
        if (this._crc === undefined) {
            throw new Error("Couldn't retrieve the ConsensusRegisterCollection");
        }
        return this._crc;
    }

    private get taskManager() {
        if (this._taskManager === undefined) {
            throw new Error("Couldn't retrieve the TaskManager");
        }
        return this._taskManager;
    }

    public get migrated() {
        return this.crc.read(newContainerIdKey) !== undefined;
    }

    public get newContainerId() {
        return this._newContainerId;
    }

    public async setNewContainerId(id: string) {
        // Using a consensus-type data structure here, to make it easier to validate
        // that the setNewContainerId was ack'd and we can have confidence other clients will agree.
        await this.crc.write(newContainerIdKey, id);
    }

    public get codeDetailsAccepted() {
        return this.quorum.get(codeDetailsProposedKey) !== undefined;
    }

    public get acceptedCodeDetails() {
        return this.quorum.get(codeDetailsProposedKey) as IFluidCodeDetails | undefined;
    }

    public async proposeCodeDetails(codeDetails: IFluidCodeDetails) {
        // Early exit/resolve if already marked.
        if (this.codeDetailsAccepted) {
            return;
        }

        // Note that the marking could come from another client (e.g. two clients try to mark simultaneously).
        // Watching via the event listener will work regardless of whether our marking or a remote client's
        // marking was the one that actually wrote the flag.
        return new Promise<void>((resolve, reject) => {
            const acceptedListener = (key: string) => {
                if (key === codeDetailsProposedKey) {
                    resolve();
                    this.quorum.off("accepted", acceptedListener);
                }
            };
            this.quorum.on("accepted", acceptedListener);
            // Even if quorum.set() becomes a promise, this will remain fire-and-forget since we don't care
            // whether our marking or a remote client's marking writes the flag (though maybe we'd do retry
            // logic if a remote client rejects the local client's mark).
            this.quorum.set(codeDetailsProposedKey, codeDetails);
        });
    }

    public async volunteerForMigration(): Promise<void> {
        return this.taskManager.lockTask(migrateTaskName);
    }

    public haveMigrationTask(): boolean {
        return this.taskManager.haveTaskLock(migrateTaskName);
    }

    protected async initializingFirstTime() {
        const quorum = Quorum.create(this.runtime);
        const crc = ConsensusRegisterCollection.create(this.runtime);
        const taskManager = TaskManager.create(this.runtime);
        this.root.set(quorumKey, quorum.handle);
        this.root.set(crcKey, crc.handle);
        this.root.set(taskManagerKey, taskManager.handle);
    }

    protected async hasInitialized() {
        const quorumHandle = this.root.get(quorumKey);
        this._quorum = await quorumHandle.get();

        const crcHandle = this.root.get(crcKey);
        this._crc = await crcHandle.get();

        this.quorum.on("accepted", (key: string) => {
            if (key === codeDetailsProposedKey) {
                this.emit("codeDetailsAccepted");
            }
        });

        this.crc.on("atomicChanged", (key: string, value: string) => {
            if (key === newContainerIdKey) {
                this._newContainerId = value;
                this.emit("migrated");
            }
        });

        const taskManagerHandle = this.root.get(taskManagerKey);
        this._taskManager = await taskManagerHandle.get();
    }
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const ContainerKillBitInstantiationFactory =
    new DataObjectFactory<ContainerKillBit>(
        "container-kill-bit",
        ContainerKillBit,
        [
            ConsensusRegisterCollection.getFactory(),
            Quorum.getFactory(),
            TaskManager.getFactory(),
        ],
        {},
    );
