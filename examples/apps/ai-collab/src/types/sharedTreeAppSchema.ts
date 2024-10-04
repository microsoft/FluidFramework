/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "fluid-framework";

import type { Engineer, Task, TaskGroup } from "./task";

// The string passed to the SchemaFactory should be unique
const sf = new SchemaFactory("fluidHelloWorldSample");

export class SharedTreeTask extends sf.object("Task", {
	id: sf.identifier,
	title: sf.string,
	description: sf.string,
	priority: sf.string,
	complexity: sf.number,
	status: sf.string,
	assignee: sf.optional(sf.string),
}) {}

export class SharedTreeTaskList extends sf.array("TaskList", SharedTreeTask) {}

export class SharedTreeEngineer extends sf.object("Engineer", {
	id: sf.identifier,
	name: sf.string,
	skills: sf.string,
	maxCapacity: sf.number,
}) {}

export class SharedTreeEngineerList extends sf.array("EngineerList", SharedTreeEngineer) {}

export class SharedTreeTaskGroup extends sf.object("TaskGroup", {
	id: sf.identifier,
	title: sf.string,
	description: sf.string,
	tasks: SharedTreeTaskList,
	engineers: SharedTreeEngineerList,
}) {}

export class SharedTreeTaskGroupList extends sf.array("TaskGroupList", SharedTreeTaskGroup) {}

export class SharedTreeAppState extends sf.object("AppState", {
	taskGroups: SharedTreeTaskGroupList,
}) {}

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
					priority: "low",
					complexity: 1,
					status: "todo",
				},
				{
					assignee: "Bob",
					title: "Task #2",
					description:
						"This is the second task.  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "medium",
					complexity: 2,
					status: "in-progress",
				},
				{
					assignee: "Charlie",
					title: "Task #3",
					description:
						"This is the third task!  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "high",
					complexity: 3,
					status: "done",
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
		{
			title: "My Second Task Group",
			description: "Placeholder for second task group",
			tasks: [
				{
					assignee: "Alice",
					title: "Task #1",
					description:
						"This is the first task. Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "low",
					complexity: 1,
					status: "todo",
				},
				{
					assignee: "Bob",
					title: "Task #2",
					description:
						"This is the second task.  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "medium",
					complexity: 2,
					status: "in-progress",
				},
				{
					assignee: "Charlie",
					title: "Task #3",
					description:
						"This is the third task!  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
					priority: "high",
					complexity: 3,
					status: "done",
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
