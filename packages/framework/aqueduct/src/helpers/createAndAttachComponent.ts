/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IHostRuntime,
} from "@microsoft/fluid-runtime-definitions";

/**
 * Calls create, initialize, and attach on a new component.
 *
 * @param runtime - It is the runtime for the container.
 * @param id - unique component id for the new component
 * @param pkg - package name for the new component
 */
export async function createAndAttachComponent<T>(
    runtime: IHostRuntime,
    id: string,
    pkg: string,
): Promise<T> {
    try {
        const componentRuntime = await runtime.createComponent(id, pkg);

        const result = await componentRuntime.request({ url: "/" });
        if (result.status !== 200 || result.mimeType !== "fluid/component") {
            throw new Error("Failed to get component.");
        }

        componentRuntime.attach();

        return result.value as T;
    } catch (error) {
        runtime.error(error);
        throw error;
    }
}
