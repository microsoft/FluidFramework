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
 * Host services provides a collection of interfaces exposed by a gateway host
 */
/* eslint-disable @typescript-eslint/no-empty-interface */
export interface IHostServices extends Partial<
    IProvideDocumentFactory
    & IProvideMicrosoftGraph
    & IProvidePackageManager> {
}
/* eslint-enable @typescript-eslint/no-empty-interface */
