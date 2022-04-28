/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskManager } from "@fluid-experimental/task-manager";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import { IDiceRoller } from "./interface";

const taskManagerKey = "taskManager";
// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";
const autoRollTaskId = "autoRoll";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class TaskManagerDiceRoller extends DataObject implements IDiceRoller {
    private _taskManager: TaskManager | undefined;
    private autoRollInterval: ReturnType<typeof setInterval> | undefined;

    /**
     * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
     * initialize the state of the DataObject.
     */
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);

        // We create a TaskManager just like any other DDS.
        const taskManager = TaskManager.create(this.runtime);
        this.root.set(taskManagerKey, taskManager.handle);
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for dice rolls.
     */
    protected async hasInitialized() {
        this.root.on("valueChanged", (changed) => {
            if (changed.key === diceValueKey) {
                // When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
                this.emit("diceRolled");
            }
        });

        const taskManagerHandle = this.root.get<IFluidHandle<TaskManager>>(taskManagerKey);
        this._taskManager = await taskManagerHandle?.get();

        this.volunteerForAutoRoll();
    }

    private get taskManager() {
        assert(this._taskManager !== undefined, "TaskManager not initialized");
        return this._taskManager;
    }

    public get value() {
        const value = this.root.get<number>(diceValueKey);
        assert(value !== undefined, "Dice value not initialized");
        return value;
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };

    public volunteerForAutoRoll() {
        // Try to take the task and wait until we get it.  This may wait forever if the current task holder
        // doesn't release it.
        this.taskManager.lockTask(autoRollTaskId)
            .then(async () => {
                // Attempt to reacquire the task if we lose it
                this.taskManager.once("lost", () => {
                    this.emit("taskOwnershipChanged");
                    this.endAutoRollTask();
                    this.volunteerForAutoRoll();
                });
                this.emit("taskOwnershipChanged");
                this.startAutoRollTask();
            }).catch(() => {
                // We're not going to abandon our attempt, so if the promise rejects it probably means we got
                // disconnected.  So we'll try again once we reconnect.  If it was for some other reason, we'll
                // give up.
                if (!this.runtime.connected) {
                    this.runtime.once("connected", () => { this.volunteerForAutoRoll(); });
                }
            });
    }

    private startAutoRollTask() {
        console.log("Starting autoroll from TaskManagerDiceRoller");
        if (this.autoRollInterval === undefined) {
            this.autoRollInterval = setInterval(() => {
                this.roll();
            }, 1000);
        }
    }

    private endAutoRollTask() {
        console.log("Ending autoroll from TaskManagerDiceRoller");
        if (this.autoRollInterval !== undefined) {
            clearInterval(this.autoRollInterval);
            this.autoRollInterval = undefined;
        }
    }

    public hasTask() {
        return this.taskManager.haveTaskLock(autoRollTaskId);
    }
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const TaskManagerDiceRollerInstantiationFactory = new DataObjectFactory(
    "@fluid-example/task-manager-dice-roller",
    TaskManagerDiceRoller,
    // Since TaskManager is a DDS, we need to register it for creation.
    [TaskManager.getFactory()],
    {},
);
