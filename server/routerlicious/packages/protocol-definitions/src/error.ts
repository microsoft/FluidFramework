/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Error tracking service.
export interface IErrorTrackingService {
    /**
     * Track error/exception using a service.
     */
    track(func: () => void);
}
