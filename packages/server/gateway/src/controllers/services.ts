/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideDocumentFactory,
    IProvideMicrosoftGraph,
    IProvidePackageManager,
} from "@microsoft/fluid-host-service-interfaces";

/**
 * Host services provides a collection of intefaces exposed by a gateway host
 */
// tslint:disable-next-line:no-empty-interface
export interface IHostServices extends
    IProvideDocumentFactory,
    IProvideMicrosoftGraph,
    IProvidePackageManager {
}
