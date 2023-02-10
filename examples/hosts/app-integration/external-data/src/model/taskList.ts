/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISharedCell, SharedCell } from "@fluidframework/cell";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString } from "@fluidframework/sequence";
import { SharedMap } from "@fluidframework/map";

import type { ITask, ITaskEvents, ITaskList, TaskData } from "../model-interface";
import { externalDataServicePort } from "../mock-external-data-service-interface";

class Task extends TypedEventEmitter<ITaskEvents> implements ITask {
	public get id(): string {
		return this._id;
	}
	// Probably would be nice to not hand out the SharedString, but the CollaborativeInput expects it.
	public get draftName(): SharedString {
		return this._draftName;
	}
	public get draftPriority(): number {
		const cellValue = this._draftPriority.get();
		if (cellValue === undefined) {
			throw new Error("Expected a valid priority");
		}
		return cellValue;
	}
	public get externalName(): string | undefined {
		return this._externalName;
	}
	public set externalName(newValue: string | undefined) {
		this._externalName = newValue;
		this.emit("externalNameChanged");
	}
	public get changeType(): string | undefined {
		return this._changeType;
	}
	public set changeType(newValue: string | undefined) {
		const changesAvailable = newValue !== undefined;
		this._changeType = newValue;
		this.emit("changesAvailable", changesAvailable);
	}
	public get externalPriority(): number | undefined {
		return this._externalPriority;
	}
	public set externalPriority(newValue: number | undefined) {
		this._externalPriority = newValue;
		this.emit("externalPriorityChanged");
	}
	private _externalName: string | undefined;
	private _externalPriority: number | undefined;
	private _changeType: string | undefined;
	public constructor(
		private readonly _id: string,
		private readonly _draftName: SharedString,
		private readonly _draftPriority: ISharedCell<number>,
	) {
		super();
		this._draftName.on("sequenceDelta", () => {
			this.emit("draftNameChanged");
		});
		this._draftPriority.on("valueChanged", () => {
			this.emit("draftPriorityChanged");
		});
	}
	public externalNameChanged = (savedName: string): void => {
		this.changeType = "change";
		this.externalName = savedName;
	};
	public externalPriorityChanged = (savedPriority: number): void => {
		this.changeType = "change";
		this.externalPriority = savedPriority;
	};
	public overwriteWithExternalData = (): void => {
		this.changeType = undefined;
		if (this.externalPriority !== undefined) {
			this._draftPriority.set(this.externalPriority);
		}
		if (this.externalName !== undefined) {
			const oldString = this._draftName.getText();
			this._draftName.replaceText(0, oldString.length, this.externalName);
		}
	};
}

/**
 * Persisted form of task data stored in root {@link @fluidframework/map#SharedDirectory}.
 */
interface PersistedTask {
	id: string;
	name: IFluidHandle<SharedString>;
	priority: IFluidHandle<ISharedCell<number>>;
}

/**
 * The TaskList is our data object that implements the ITaskList interface.
 */
export class TaskList extends DataObject implements ITaskList {
	/**
	 * The tasks collection holds local facades on the data.  These facades encapsulate the data for a single task
	 * so we don't have to hand out references to the whole SharedDirectory.  Additionally, we only create them
	 * after performing the async operations to retrieve the constituent data (.get() the handles) which allows
	 * the ITask interface to be synchronous, and therefore easier to use in a view.  This is an example of the
	 * collection pattern -- see the contact-collection example for more details on this pattern.
	 */
	private readonly tasks = new Map<string, Task>();
	/*
	 * externalDataSnapshot stores data retrieved from the external external.
	 */
	private _externalDataSnapshot: SharedMap | undefined;
	/*
	 * draftData is used for storage of the draft Fluid data. It's used with externalDataSnapshot
	 * to resolve & synchronize the data.
	 * TODO: Update^ when the sync mechanism is appropriately defined.
	 */
	private _draftData: SharedMap | undefined;

	private get externalDataSnapshot(): SharedMap {
		if (this._externalDataSnapshot === undefined) {
			throw new Error("The externalDataSnapshot SharedMap has not yet been initialized.");
		}
		return this._externalDataSnapshot;
	}

	private get draftData(): SharedMap {
		if (this._draftData === undefined) {
			throw new Error("The draftData SharedMap has not yet been initialized.");
		}
		return this._draftData;
	}

	public readonly addTask = (id: string, name: string, priority: number): void => {
		if (this.tasks.get(id) !== undefined) {
			throw new Error("Task already exists");
		}
		const draftNameString = SharedString.create(this.runtime);

		// TODO: addTask will be called for tasks added in Fluid. Should only write to the draftMap directly here
		// savedMap will get updated when the data syncs back
		draftNameString.insertText(0, name);

		const draftPriorityCell = SharedCell.create(this.runtime) as ISharedCell<number>;

		draftPriorityCell.set(priority);

		// To add a task, we update the root SharedDirectory. This way the change is propagated to all collaborators
		// and persisted.  In turn, this will trigger the "valueChanged" event and handleDraftTaskAdded which will update
		// the this.tasks collection.
		const draftDataPT: PersistedTask = {
			id,
			name: draftNameString.handle as IFluidHandle<SharedString>,
			priority: draftPriorityCell.handle as IFluidHandle<ISharedCell<number>>,
		};
		this.draftData.set(id, draftDataPT);
	};

	public readonly deleteTask = (id: string): void => {
		this.draftData.delete(id);
	};

	public readonly getTasks = (): Task[] => {
		return [...this.tasks.values()];
	};

	public readonly getTask = (id: string): Task | undefined => {
		return this.tasks.get(id);
	};

	private readonly handleDraftTaskAdded = async (id: string): Promise<void> => {
		const taskData = this._draftData?.get(id) as PersistedTask;
		if (taskData === undefined) {
			throw new Error("Newly added task is missing from draft map.");
		}

		const [nameSharedString, prioritySharedCell] = await Promise.all([
			taskData.name.get(),
			taskData.priority.get(),
		]);

		// It's possible the task was deleted while getting the name/priority, in which case quietly exit.
		if (this._draftData?.get(id) === undefined) {
			return;
		}
		const newTask = new Task(id, nameSharedString, prioritySharedCell);
		this.tasks.set(id, newTask);
		this.emit("taskAdded", newTask);
	};

	private readonly handleDraftTaskDeleted = (id: string): void => {
		const deletedTask = this.tasks.get(id);
		this.tasks.delete(id);
		// Here we might want to consider raising an event on the Task object so that anyone holding it can know
		// that it has been removed from its collection.  Not needed for this example though.
		this.emit("taskDeleted", deletedTask);
	};

	/**
	 * Fetch any updated data from the external data external and sync local state to it.
	 * Upon receipt of new external data, the external data is written immediately into
	 * the "externalDataSnapshot" map, and a check occurs comparing the externalDataSnapshot to the DraftData.
	 * If there are differences between the two, this function kicks off Task functions
	 * that displays conflict resolution UI to the screen.
	 *
	 * @returns A promise that resolves when the external data fetch and Fluid data update complete.
	 *
	 * @privateRemarks
	 *
	 * TODO: Make this method private - should only be triggered when source signal/op indicates that the data
	 * was updated.
	 *
	 * TODO: Is it useful to block further changes during the sync'ing process?
	 * Consider implementing a state to put the data object in while import is occurring (e.g. to disable input, etc.).
	 *
	 * TODO: Consider performing the update in 2 phases (fetch, merge) to enable some nice conflict UI
	 *
	 * TODO: Guard against reentrancy
	 *
	 * TODO: Use leader election to reduce noise from competing clients
	 */
	public async importExternalData(): Promise<void> {
		console.log("TASK-LIST: Fetching external data from service...");

		let incomingExternalData: [
			string,
			{
				name: string;
				priority: number;
			},
		][];
		try {
			const response = await fetch(
				`http://localhost:${externalDataServicePort}/fetch-tasks`,
				{
					method: "GET",
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "application/json",
					},
				},
			);

			const responseBody = (await response.json()) as Record<string, unknown>;
			if (responseBody.taskList === undefined) {
				throw new Error("Task list fetch returned no data.");
			}
			const data = responseBody.taskList as TaskData;
			incomingExternalData = Object.entries(data);
			console.log("TASK-LIST: Data imported from service.", incomingExternalData);
		} catch (error) {
			console.error(`Task list fetch failed due to an error:\n${error}`);

			// TODO: Display error status to user? Attempt some number of retries on failure?

			return;
		}

		// TODO: Delete any items that are in the root but missing from the external data
		const updateTaskPs = updatedExternalData.map(async ([id, { name, priority }]) => {
			// Write external data into savedData map.
			const currentTask = this.savedData.get<PersistedTask>(id);
			let sourceNameDiffersFromSavedName = false;
			let sourcePriorityDiffersFromSavedPriority = false;
			// Create a new task because it doesn't exist already
			if (currentTask === undefined) {
				const savedNameString = SharedString.create(this.runtime);
				const savedPriorityCell = SharedCell.create(this.runtime) as ISharedCell<number>;
				const savedDataPT: PersistedTask = {
					id,
					name: savedNameString.handle as IFluidHandle<SharedString>,
					priority: savedPriorityCell.handle as IFluidHandle<ISharedCell<number>>,
				};
				savedNameString.insertText(0, name);
				savedPriorityCell.set(priority);
				this.savedData.set(id, savedDataPT);
			} else {
				// Make changes to exisiting saved tasks
				const [savedNameString, savedPriorityCell] = await Promise.all([
					currentTask.name.get(),
					currentTask.priority.get(),
				]);
				if (savedNameString.getText() !== name) {
					sourceNameDiffersFromSavedName = true;
				}
				if (savedPriorityCell.get() !== priority) {
					sourcePriorityDiffersFromSavedPriority = true;
				}
				savedNameString.insertText(0, name);
				savedPriorityCell.set(priority);
			}

			// Now look for differences between draftData and savedData
			const task = this.tasks.get(id);
			if (task === undefined) {
				// A new task was added from external source, add it to the Fluid data.
				this.addTask(id, name, priority);
				return;
			}
			// External change has come in AND local change has happened, so there is some conflict to resolve
			if (sourceNameDiffersFromSavedName && task.draftName.getText() !== name) {
				task.sourceNameChanged(name);
			}
			// External change has come in AND local change has happened, so there is some conflict to resolve
			if (sourcePriorityDiffersFromSavedPriority && task.draftPriority !== priority) {
				task.sourcePriorityChanged(priority);
			}
		});
		await Promise.all(updateTaskPs);
	}
	/**
	 * Save the current data in the container back to the external data source.
	 *
	 * @remarks
	 *
	 * This method is public, and would map to clicking a "Save" button in some UX.
	 * For more-automatic sync'ing this method probably wouldn't exist.
	 *
	 * @returns A promise that resolves when the write completes.
	 */
	public readonly writeToExternalServer = async (): Promise<void> => {
		// TODO: Consider this.getTasks() will include local (un-ack'd) changes to the Fluid data as well.  In
		// the "save" button case this might be fine (the user saves what they see), but in more-automatic
		// sync'ing perhaps this should only include ack'd changes (by spinning up a second local client same
		// as what we do for summarization).
		const tasks = this.getTasks();
		const formattedTasks = {};
		for (const task of tasks) {
			formattedTasks[task.id] = {
				name: task.draftName.getText(),
				priority: task.draftPriority,
			};
		}
		try {
			await fetch(`http://localhost:${externalDataServicePort}/set-tasks`, {
				method: "POST",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ taskList: formattedTasks }),
			});
		} catch (error) {
			console.error(`Task list submition failed due to an error:\n${error}`);

			// TODO: display error status to user?
		}
	};

	protected async initializingFirstTime(): Promise<void> {
		this._draftData = SharedMap.create(this.runtime);
		this._externalDataSnapshot = SharedMap.create(this.runtime);
		this.root.set("draftData", this._draftData.handle);
		this.root.set("externalDataSnapshot", this._externalDataSnapshot.handle);
		// TODO: Probably don't need to await this once the sync'ing flow is solid, we can just trust it to sync
		// at some point in the future.
		await this.importExternalData();
	}

	/**
	 * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
	 * DataObject, by registering an event listener for changes to the task list.
	 */
	protected async hasInitialized(): Promise<void> {
		const saved = this.root.get<IFluidHandle<SharedMap>>("externalDataSnapshot");
		if (saved === undefined) {
			throw new Error("externalDataSnapshot was not initialized");
		}
		this._externalDataSnapshot = await saved.get();

		const draft = this.root.get<IFluidHandle<SharedMap>>("draftData");
		if (draft === undefined) {
			throw new Error("draftData was not initialized");
		}
		this._draftData = await draft.get();

		this._draftData.on("valueChanged", (changed) => {
			if (changed.previousValue === undefined) {
				// Must be from adding a new task
				this.handleDraftTaskAdded(changed.key).catch((error) => {
					console.error(error);
				});
			} else if (this.draftData.get(changed.key) === undefined) {
				// Must be from a deletion
				this.handleDraftTaskDeleted(changed.key);
			} else {
				// Since all data modifications happen within the SharedString or SharedCell (task IDs are immutable),
				// the root directory should never see anything except adds and deletes.
				console.error("Unexpected modification to task list");
			}
		});

		for (const [id, task] of this.draftData) {
			const typedTaskData = task as PersistedTask;
			const [nameSharedString, prioritySharedCell] = await Promise.all([
				typedTaskData.name.get(),
				typedTaskData.priority.get(),
			]);
			this.tasks.set(id, new Task(id, nameSharedString, prioritySharedCell));
		}
	}
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  The third argument lists the other data structures it will utilize.  In this
 * scenario, the fourth argument is not used.
 */
export const TaskListInstantiationFactory = new DataObjectFactory<TaskList>(
	"task-list",
	TaskList,
	[SharedCell.getFactory(), SharedString.getFactory(), SharedMap.getFactory()],
	{},
);
