/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * string-parsed representation of task data, returned from {@link parseStringData}.
 */
export interface ParsedTaskData {
    id: string;
    name: string;
    priority: number;
}

/**
 * Parse string data into an array of simple objects that are easily imported into a task list.
 * Each task is represented in the string in the format [id]:[name]:[priority], separated by newlines.
 *
 * @param stringData - formatted string data
 *
 * @returns An array of objects, each representing a single task.
 *
 * @privateRemarks
 *
 * TODO: See notes below about moving away from plain string to something more realistic.
 */
export function parseStringData(stringData: string): ParsedTaskData[] {
    const taskStrings = stringData.split("\n");
    return taskStrings.map((taskString) => {
        const [taskIdString, taskNameString, taskPriorityString] = taskString.split(":");
        return {
            id: taskIdString,
            name: taskNameString,
            priority: Number.parseInt(taskPriorityString, 10),
        };
    });
}
