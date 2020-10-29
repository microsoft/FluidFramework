/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import { ContainerRuntime } from "@fluidframework/container-runtime";

export function apisToBundle() {
    assert(true);
    // Pass through dummy parameters, this file is only used for bundle analysis
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ContainerRuntime.load(undefined as any, undefined as any);
}
