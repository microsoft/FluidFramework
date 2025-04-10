/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This feature indicates the ContainerRuntime will encode handles
 * If the Runtime layer supports this feature, the DataStore layer need not encode handles (but do bind them)
 *
 * @internal
 */
export const encodeHandlesInContainerRuntime = "encodeHandlesInContainerRuntime" as const;
