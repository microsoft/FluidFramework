/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandleContext } from "@fluidframework/component-core-interfaces";

/**
 * Generates the absolute path for the ComponentHandle by iterating through the routeContexts.
 */
export function generateHandleContextPath(handleContext: IComponentHandleContext): string {
    let result = "";
    let context: IComponentHandleContext | undefined = handleContext;

    while (context !== undefined) {
        if (context.id !== "") {
            result = `/${context.id}${result}`;
        }

        context = context.routeContext;
    }

    return result;
}
