/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface TaskGroup {
	id: string;
	title: string;
	description: string;
	tasks: Task[];
	engineers: Engineer[];
}

export interface Engineer {
	id: string;
	name: string;
	skills: string;
	maxCapacity: number;
}

export interface Task {
	id: string;
	assignee: string | undefined;
	title: string;
	description: string;
	priority: TaskPriority;
	complexity: number;
	status: TaskStatus;
}

export const TaskStatuses = {
	TODO: "todo",
	IN_PROGRESS: "in-progress",
	DONE: "done",
} as const;
export type TaskStatus = (typeof TaskStatuses)[keyof typeof TaskStatuses];

export const TaskPriorities = {
	LOW: "low",
	MEDIUM: "medium",
	HIGH: "high",
} as const;
export type TaskPriority = (typeof TaskPriorities)[keyof typeof TaskPriorities];
