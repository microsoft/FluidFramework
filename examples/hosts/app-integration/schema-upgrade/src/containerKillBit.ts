/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskManager } from "@fluid-experimental/task-manager";
import { Quorum } from "@fluid-internal/quorum";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
// import { IFluidHandle } from "@fluidframework/core-interfaces";

const quorumKey = "quorum";
const crcKey = "crc";
const taskManagerKey = "task-manager";
const markedForDestructionKey = "marked";
const destroyTaskName = "destroy";
const deadKey = "dead";

export interface IContainerKillBitEvents extends IEvent {
    (event: "markedForDestruction" | "dead", listener: () => void);
}

export interface IContainerKillBit extends IEventProvider<IContainerKillBitEvents> {
    dead: boolean;
    setDead(): Promise<void>;
    markedForDestruction: boolean;
    markForDestruction(): Promise<void>;
    volunteerForDestruction(): Promise<void>;
    haveDestructionTask(): boolean;
}

export class ContainerKillBit extends DataObject implements IContainerKillBit {
    private _quorum: Quorum | undefined;
    private _crc: ConsensusRegisterCollection<boolean> | undefined;
    private _taskManager: TaskManager | undefined;

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

    public get dead() {
        return this.crc.read(deadKey) as boolean;
    }

    public async setDead() {
        // Using a consensus-type data structure here, to make it easier to validate
        // that the setDead was ack'd and we can have confidence other clients will agree.
        await this.crc.write(deadKey, true);
    }

    public get markedForDestruction() {
        return this.quorum.get(markedForDestructionKey) as boolean;
    }

    public async markForDestruction() {
        // Early exit/resolve if already marked.
        if (this.markedForDestruction) {
            return;
        }

        // Note that the marking could come from another client (e.g. two clients try to mark simultaneously).
        // Watching via the event listener will work regardless of whether our marking or a remote client's
        // marking was the one that actually wrote the flag.
        return new Promise<void>((resolve, reject) => {
            const acceptedListener = (key: string) => {
                if (key === markedForDestructionKey) {
                    resolve();
                    this.quorum.off("accepted", acceptedListener);
                }
            };
            this.quorum.on("accepted", acceptedListener);
            // Even if quorum.set() becomes a promise, this will remain fire-and-forget since we don't care
            // whether our marking or a remote client's marking writes the flag (though maybe we'd do retry
            // logic if a remote client rejects the local client's mark).
            this.quorum.set(markedForDestructionKey, true);
        });
    }

    public async volunteerForDestruction(): Promise<void> {
        return this.taskManager.lockTask(destroyTaskName);
    }

    public haveDestructionTask(): boolean {
        return this.taskManager.haveTaskLock(destroyTaskName);
    }

    protected async initializingFirstTime() {
        const quorum = Quorum.create(this.runtime);
        const crc = ConsensusRegisterCollection.create(this.runtime);
        const taskManager = TaskManager.create(this.runtime);
        this.root.set(quorumKey, quorum.handle);
        this.root.set(crcKey, crc.handle);
        this.root.set(taskManagerKey, taskManager.handle);
        // TODO: Update if/when .set() returns a promise.
        const initialSetP = new Promise<void>((resolve) => {
            const watchForInitialSet = (key: string) => {
                if (key === markedForDestructionKey) {
                    resolve();
                    quorum.off("accepted", watchForInitialSet);
                }
            };
            quorum.on("accepted", watchForInitialSet);
        });
        quorum.set(markedForDestructionKey, false);
        await initialSetP;
        await crc.write(deadKey, false);
    }

    protected async hasInitialized() {
        const quorumHandle = this.root.get(quorumKey);
        this._quorum = await quorumHandle.get();

        const crcHandle = this.root.get(crcKey);
        this._crc = await crcHandle.get();

        this.quorum.on("accepted", (key: string) => {
            if (key === markedForDestructionKey) {
                this.emit("markedForDestruction");
            }
        });

        this.crc.on("atomicChanged", (key) => {
            if (key === deadKey) {
                this.emit("dead");
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
