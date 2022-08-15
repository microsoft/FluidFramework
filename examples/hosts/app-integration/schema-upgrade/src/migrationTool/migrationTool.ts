/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskManager } from "@fluid-experimental/task-manager";
import { Quorum } from "@fluid-internal/quorum";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";

import type { IMigrationTool } from "./interfaces";

const quorumKey = "quorum";
const crcKey = "crc";
const taskManagerKey = "task-manager";
const newVersionKey = "newVersion";
const migrateTaskName = "migrate";
const newContainerIdKey = "newContainerId";

export class MigrationTool extends DataObject implements IMigrationTool {
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
        // Only permit a single container to be set as a migration destination.
        if (this.crc.read(newContainerIdKey) !== undefined) {
            throw new Error("New container was already established");
        }

        // Using a consensus data structure is important here, because other clients might race us to set the new
        // value.  All clients must agree on the final value even in these race conditions so everyone ends up in the
        // same final container.
        await this.crc.write(newContainerIdKey, id);
    }

    public get acceptedVersion() {
        return this.quorum.get(newVersionKey) as string | undefined;
    }

    public async proposeVersion(newVersion: string) {
        // Don't permit changes to the version after a new one has already been accepted.
        // TODO: Consider whether we should throw on trying to set when a pending proposal exists -- currently
        // the Quorum will silently drop these on the floor.
        if (this.acceptedVersion !== undefined) {
            throw new Error("New version was already accepted");
        }

        // Note that the accepted proposal could come from another client (e.g. two clients try to propose
        // simultaneously).  Watching via the event listener will work regardless of whether our proposal or
        // a remote client's proposal was the one that actually got accepted.
        return new Promise<void>((resolve, reject) => {
            const acceptedListener = (key: string) => {
                if (key === newVersionKey) {
                    resolve();
                    this.quorum.off("accepted", acceptedListener);
                }
            };
            this.quorum.on("accepted", acceptedListener);
            // Even if quorum.set() becomes a promise, this will remain fire-and-forget since we don't care
            // whether our proposal or a remote client's proposal is accepted (though maybe we'd do retry
            // logic if a remote client rejects the local client's proposal).
            this.quorum.set(newVersionKey, newVersion);
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
            if (key === newVersionKey) {
                this.emit("newVersionAccepted");
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
export const MigrationToolInstantiationFactory =
    new DataObjectFactory<MigrationTool>(
        "migration-tool",
        MigrationTool,
        [
            ConsensusRegisterCollection.getFactory(),
            Quorum.getFactory(),
            TaskManager.getFactory(),
        ],
        {},
    );
