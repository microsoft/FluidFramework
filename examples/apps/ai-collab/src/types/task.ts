/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TaskPriority, TaskStatus } from "./sharedTreeAppSchema";

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
