/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "fluid-framework";

import type { Engineer, Task, TaskGroup } from "./task";

// The string passed to the SchemaFactory should be unique
const sf = new SchemaFactory("ai-collab-sample-application");

// NOTE that there is currently a bug with the ai-collab library that requires us to rearrange the keys of each type to not have the same first key.

export class SharedTreeTask extends sf.object("Task", {
	title: sf.required(sf.string, {
		metadata: {
			description: `The title of the task`,
		},
	}),
	id: sf.identifier,
	description: sf.required(sf.string, {
		metadata: {
			description: `The description of the task`,
		},
	}),
	priority: sf.required(sf.string, {
		metadata: {
			description: `The case-sensitive priority of the task which which can ONLY of three levels: "Low", "Medium", "High"`,
		},
	}),
	complexity: sf.required(sf.number, {
		metadata: {
			description: `The complexity of the task as a fibonacci number`,
		},
	}),
	status: sf.required(sf.string, {
		metadata: {
			description: `The case-sensitive status of the task which can ONLY be either one of the following values "To Do", "In Progress", or "Done"`,
		},
	}),
	assignee: sf.required(sf.string, {
		metadata: {
			description: `The name of the tasks assignee e.g. "Bob" or "Alice"`,
		},
	}),
}) {}

export class SharedTreeTaskList extends sf.array("TaskList", SharedTreeTask) {}

export class SharedTreeEngineer extends sf.object("Engineer", {
	name: sf.required(sf.string, {
		metadata: {
			description: `The name of an engineer whom can be assigned to a task`,
		},
	}),
	id: sf.identifier,
	skills: sf.required(sf.string, {
		metadata: {
			description: `A description of the engineers skills which influence what types of tasks they should be assigned to.`,
		},
	}),
	maxCapacity: sf.required(sf.number, {
		metadata: {
			description: `The maximum capacity of tasks this engineer can handle measured in in task complexity points.`,
		},
	}),
}) {}

export class SharedTreeEngineerList extends sf.array("EngineerList", SharedTreeEngineer) {}

export class SharedTreeTaskGroup extends sf.object("TaskGroup", {
	description: sf.required(sf.string, {
		metadata: {
			description: `The description of the task group, which is a collection of tasks and engineers that can be assigned to said tasks.`,
		},
	}),
	id: sf.identifier,
	title: sf.required(sf.string, {
		metadata: {
			description: `The title of the task group.`,
		},
	}),
	tasks: sf.required(SharedTreeTaskList, {
		metadata: {
			description: `The lists of tasks within this task group.`,
		},
	}),
	engineers: sf.required(SharedTreeEngineerList, {
		metadata: {
			description: `The lists of engineers within this task group which can be assigned to tasks.`,
		},
	}),
}) {}

export class SharedTreeTaskGroupList extends sf.array("TaskGroupList", SharedTreeTaskGroup) {}

export class SharedTreeAppState extends sf.object("AppState", {
	taskGroups: sf.required(SharedTreeTaskGroupList, {
		metadata: {
			description: `The list of task groups that are being managed by this task management application.`,
		},
	}),
}) {}

export const TaskStatuses = {
	TODO: "To Do",
	IN_PROGRESS: "In Progress",
	DONE: "Done",
} as const;
export type TaskStatus = (typeof TaskStatuses)[keyof typeof TaskStatuses];

export const TaskPriorities = {
	LOW: "Low",
	MEDIUM: "Medium",
	HIGH: "High",
} as const;
export type TaskPriority = (typeof TaskPriorities)[keyof typeof TaskPriorities];

export const INITIAL_APP_STATE = {
	taskGroups: [
		{
			title: "My First Task Group",
			description: "Placeholder for first task group",
			tasks: [
				{
					assignee: "Alice",
					title: "Task #1",
					description:
						"This is the first task. Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: TaskPriorities.LOW,
					complexity: 1,
					status: TaskStatuses.TODO,
				},
				{
					assignee: "Bob",
					title: "Task #2",
					description:
						"This is the second task.  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: TaskPriorities.MEDIUM,
					complexity: 2,
					status: TaskStatuses.IN_PROGRESS,
				},
				{
					assignee: "Charlie",
					title: "Task #3",
					description:
						"This is the third task!  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: TaskPriorities.HIGH,
					complexity: 3,
					status: TaskStatuses.DONE,
				},
			],
			engineers: [
				{
					name: "Alice",
					maxCapacity: 15,
					skills:
						"Senior engineer capable of handling complex tasks. Versed in most languages",
				},
				{
					name: "Bob",
					maxCapacity: 12,
					skills:
						"Mid-level engineer capable of handling medium complexity tasks. Versed in React, Node.JS",
				},
				{
					name: "Charlie",
					maxCapacity: 7,
					skills: "Junior engineer capable of handling simple tasks. Versed in Node.JS",
				},
			],
		},
	],
} as const;

export const CONTAINER_SCHEMA = {
	initialObjects: { appState: SharedTree },
};

export const TREE_CONFIGURATION = new TreeViewConfiguration({
	schema: SharedTreeAppState,
});

/**
 * Utility function to help validate Task's created by an LLM. Since SharedTree doesn't support enums, this validator helps ensure the right values are being used
 * for the 'status' and 'priority' fields of a given Task as this is a common mistake LLM's make despite describing the fields as enums in their metadata.
 */
export function validateLlmTask(task: SharedTreeTask): void {
	if (Object.values(TaskStatuses).includes(task.status as TaskStatus) === false) {
		const errorMessage = `The Task status value "${task.status}" is not valid. The accepted values are "${Object.values(TaskStatuses).join(", ")}"`;
		console.log(errorMessage);
		throw new Error(errorMessage);
	}

	if (Object.values(TaskPriorities).includes(task.priority as TaskPriority) === false) {
		const errorMessage = `The Task priority value "${task.priority}" is not valid. The accepted values are "${Object.values(TaskPriorities).join(", ")}`;
		console.log(errorMessage);
		throw new Error(errorMessage);
	}
}

export function sharedTreeTaskGroupToJson(taskGroup: SharedTreeTaskGroup): TaskGroup {
	return {
		id: taskGroup.id,
		title: taskGroup.title,
		description: taskGroup.description,
		tasks: taskGroup.tasks.map((task) => {
			return { ...task };
		}) as Task[],
		engineers: taskGroup.engineers.map((engineer) => {
			return { ...engineer };
		}) as Engineer[],
	};
}
