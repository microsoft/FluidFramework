/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const runtimeEvents = [
    "op",
    "pre-op",
    "update",
];

export function injectSharedObjectInterception(
    sharedObject: any,
    listenedEvents?: string[],
) {
    sharedObject.internalEmit = sharedObject.emit.bind(sharedObject);
    const allEvents: string[] = [...runtimeEvents, ...(listenedEvents ?? [])];
    const emitFunction = ((event: string | symbol, ...args: any[]) => {
        if (!allEvents.includes(event as string)) {
            sharedObject.internalEmit("update", sharedObject);
            return sharedObject.internalEmit(event, ...args);
        }
    });
    sharedObject.emit = emitFunction.bind(sharedObject);
    return sharedObject;
}
