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

interface TaskData {
    [key: string]: {
        name: string;
        priority: number;
    };
};
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
export function parseTaskData(taskData: object): ParsedTaskData[] {
    const preparsed = taskData as TaskData;
    return Object.entries(preparsed).map((task) => {
        return {
            id: task[0],
            name: task[1].name,
            priority: task[1].priority,
        };
    });
}
