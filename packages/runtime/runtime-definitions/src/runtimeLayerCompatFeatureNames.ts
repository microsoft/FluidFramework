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
export const encodeHandlesInContainerRuntime = "encodeHandlesInContainerRuntime";

/**
 * This feature indicates that the datastore context will call notifyReadOnlyState on the
 * datastore runtime.
 * @internal
 */
export const notifiesReadOnlyState = "notifiesReadOnlyState";

/**
 * This feature indicates that runtime messages passed to the DataStore layer include
 * {@link IRuntimeMessagesContent.indexInBatch}.
 *
 * @remarks
 * This feature may be absent from earlier generation 10 versions, but must be present in every
 * generation 11 and later version.
 *
 * @internal
 */
export const runtimeMessagesHaveIndexInBatch = "runtimeMessagesHaveIndexInBatch";
