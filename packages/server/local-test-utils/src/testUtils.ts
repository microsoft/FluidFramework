/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { TestHost } from ".";

/**
 * TODO:
 * Keeping getComponent in testUtils even though it has been deprecated from sharedComponent
 * This is to allow us to fetch the _scheduler which is set at initializing
 * Issue #1628
*/
export async function getComponent<T extends IComponent>(
    host: TestHost,
    id: string,
    wait: boolean = true,
): Promise<T> {
    const root = await host.root;
    const request = {
        headers: [[wait]],
        url: `/${id}`,
    };

    return root.asComponent<T>(root.context.hostRuntime.request(request));
}
