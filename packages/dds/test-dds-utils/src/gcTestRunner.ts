/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@fluidframework/shared-object-base";

/**
 * Defines a set of functions to be passed to the GC test runner.
 */
export interface IGCTestProvider {
    /** The DDS whose GC data is to be verified */
    readonly sharedObject: ISharedObject;
    /** The expected list of outbound routes from this DDS */
    readonly expectedOutboundRoutes: string[];
    /** Function that adds routes to Fluid objects to the DDS' data */
    addOutboundRoutes(): Promise<void>;
    /** Function that deletes routes to Fluid objects to the DDS' data */
    deleteOutboundRoutes(): Promise<void>;
    /** Function that adds nested handles to the DDS' data */
    addNestedHandles(): Promise<void>;
}

export const runGCTests = (ctor: new () => IGCTestProvider) => {
};
