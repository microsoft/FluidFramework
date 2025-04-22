/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This feature indicates the ContainerRuntime will encode handles
 * If the Runtime layer supports this feature, the DataStore layer should not encode handles (but do bind them)
 *
 * @internal
 */
export const encodeHandlesInContainerRuntime = "encodeHandlesInContainerRuntime" as const;

/**
 * This feature indicates that the datastore context will call setReadOnlyState on the
 * datastore runtime.
 * @internal
 */
export const setReadOnlyState = "setReadOnlyState" as const;
