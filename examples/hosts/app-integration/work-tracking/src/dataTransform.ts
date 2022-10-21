/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Read the version of the string data, to understand how to parse it.  This is shared between versions.
 * This format is just one example of how you might distinguish between multiple export formats, other approaches
 * are also totally fine.
 * @param stringData - The string data to examine
 * @returns The version string
 */
export function readVersion(stringData: string) {
    const lines = stringData.split("\n");
    const [versionTag, version] = lines[0].split(":");
    if (versionTag !== "version" || typeof version !== "string" || version === "") {
        throw new Error("Can't read version");
    }
    return version;
}

/**
 * Parse string data in version:one format into an array of simple objects that are easily imported into an
 * task list.
 * @param stringData - version:one formatted string data
 * @returns An array of objects, each representing a single task
 */
export function parseStringDataVersionOne(stringData: string) {
    const version = readVersion(stringData);
    if (version !== "one") {
        throw new Error(`Expected to parse version one, got version ${version}`);
    }
    const taskStrings = stringData.split("\n");
    taskStrings.shift(); // remove version line
    return taskStrings.map((taskString) => {
        const [taskNameString, taskPriorityString] = taskString.split(":");
        return { name: taskNameString, priority: parseInt(taskPriorityString, 10) };
    });
}

/**
 * Parse string data in version:two format into an array of simple objects that are easily imported into an
 * task list.
 * @param stringData - version:two formatted string data
 * @returns An array of objects, each representing a single task
 */
export function parseStringDataVersionTwo(stringData: string) {
    const version = readVersion(stringData);
    if (version !== "two") {
        throw new Error(`Expected to parse version two, got version ${version}`);
    }
    const taskStrings = stringData.split("\n");
    taskStrings.shift(); // remove version line
    return taskStrings.map((taskString) => {
        const [taskNameString, taskPriorityString] = taskString.split("\t");
        return { name: taskNameString, priority: parseInt(taskPriorityString, 10) };
    });
}
