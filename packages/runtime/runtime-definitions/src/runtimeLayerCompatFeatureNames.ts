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
 * Indicates support for the SharedObject configuration protocol across the runtime/datastore boundary.
 * A supporting datastore context also exposes isSharedObjectConfigurationEnabled to read document state.
 * This capability does not mean that configuration is enabled in any particular document.
 * @remarks
 * Supporting and older releases can share a generation during rollout. This check can be replaced
 * by a generation floor once the supporting releases are known.
 * @internal
 */
export const supportsSharedObjectConfiguration = "supportsSharedObjectConfiguration";
