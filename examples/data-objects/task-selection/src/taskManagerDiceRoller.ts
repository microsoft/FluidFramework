/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskManager } from "@fluid-experimental/task-manager";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
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
    public static get ComponentName() { return "@fluid-example/task-manager-dice-roller"; }

    private _taskManager: TaskManager | undefined;
    private autoRollInterval: ReturnType<typeof setInterval> | undefined;

    /**
     * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
     * initialize the state of the DataObject.
     */
    protected async initializingFirstTime() {
        this.root.set(diceValueKey, 1);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.root.get(diceValueKey);
    }

    public readonly roll = () => {
        const rollValue = Math.floor(Math.random() * 6) + 1;
        this.root.set(diceValueKey, rollValue);
    };

    public volunteerForAutoRoll() {
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
        if (this.autoRollInterval === undefined) {
            this.autoRollInterval = setInterval(() => {
                this.roll();
            }, 1000);
        }
    }

    private endAutoRollTask() {
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
export const TaskManagerDiceRollerInstantiationFactory =
    new DataObjectFactory<TaskManagerDiceRoller, undefined, undefined, IEvent>
(
    TaskManagerDiceRoller.ComponentName,
    TaskManagerDiceRoller,
    [TaskManager.getFactory()],
    {},
);
