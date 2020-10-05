/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";
import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";

export class MockFluidDataStoreRuntimeWithBlobSupport extends MockFluidDataStoreRuntime {
    public uploadBlob()
}
