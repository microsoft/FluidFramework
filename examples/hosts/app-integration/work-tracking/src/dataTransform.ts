/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Parse string data in version:one format into an array of simple objects that are easily imported into an
 * task list.
 * @param stringData - version:one formatted string data
 * @returns An array of objects, each representing a single task
 */
export function parseStringData(stringData: string) {
    const taskStrings = stringData.split("\n");
    return taskStrings.map((taskString) => {
        const [taskIdString, taskNameString, taskPriorityString] = taskString.split(":");
        return { id: taskIdString, name: taskNameString, priority: parseInt(taskPriorityString, 10) };
    });
}
