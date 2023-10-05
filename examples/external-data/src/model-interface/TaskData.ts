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

	const jsonInput = input as Record<string | number | symbol, unknown>;
	for (const [key, value] of Object.entries(jsonInput)) {
		if (typeof key !== "string") {
			throw new TypeError(`Input task data contained malformed key: "${key}".`);
		}
		const jsonValue = value as Record<string | number | symbol, unknown>;
		if (!Object.prototype.hasOwnProperty.call(jsonValue, "name")) {
			throw new Error(
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Input task entry under ID "${key}" does not contain required "name" property. Received: "${jsonValue}".`,
			);
		}
		if (typeof jsonValue.name !== "string") {
			throw new TypeError(`Invalid ITaskData "name" value received: "${jsonValue.name}".`);
		}
		if (!Object.prototype.hasOwnProperty.call(jsonValue, "priority")) {
			throw new Error(
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`Input task entry under ID "${key}" does not contain required "priority" property. Received: "${jsonValue}".`,
			);
		}
		if (typeof jsonValue.priority !== "number") {
			throw new TypeError(
				`Invalid ITaskData "priority" value received: "${jsonValue.priority}".`,
			);
		}
	}
	return input as ITaskData;
}
