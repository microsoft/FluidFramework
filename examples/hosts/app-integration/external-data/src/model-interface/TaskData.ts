/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mock model for external task data
 */
export interface ITaskData {
	[key: string]: {
		name: string;
		priority: number;
	};
}

/**
 * Mock model for external taskList data
 */
export interface ITaskListData {
	[externalTaskListId: string]: ITaskData;
}

/**
 * Asserts that the input data is a valid {@link ITaskData}.
 */
export function assertValidTaskData(input: unknown): ITaskData {
	if (input === null || input === undefined) {
		throw new Error("Task data was not defined.");
	}

	const jsonValue = input as Record<string | number | symbol, unknown>;
	if (!Object.prototype.hasOwnProperty.call(jsonValue, "name")) {
		throw new Error(
			`${input} does not contain required "name" property. Received: "${jsonValue}".`,
		);
	}
	if (typeof jsonValue.name !== "string") {
		throw new TypeError(`Invalid ITaskData "name" value received: "${jsonValue.name}".`);
	}
	if (!Object.prototype.hasOwnProperty.call(jsonValue, "priority")) {
		throw new Error(
			`${input} does not contain required "priority" property. Received: "${jsonValue}".`,
		);
	}
	if (typeof jsonValue.priority !== "number") {
		throw new TypeError(
			`Invalid ITaskData "priority" value received: "${jsonValue.priority}".`,
		);
	}

	return input as ITaskData;
}
