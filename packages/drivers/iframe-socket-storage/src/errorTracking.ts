/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorTrackingService } from "@microsoft/fluid-protocol-definitions";

/**
 * The default error tracking service implementation. It does not track any errors.
 */
export class DefaultErrorTracking implements IErrorTrackingService {
    public track<T>(func: () => T): T {
        return func();
    }
}
