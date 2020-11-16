/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandleContext } from "@fluidframework/core-interfaces";

export const mockHandleContext: IFluidHandleContext = {
    absolutePath: "",
    isAttached: false,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    request: () => {
        throw new Error("Method not implemented.");
    },
    addRoute: () => {
        throw new Error("Method not implemented");
    },
};
