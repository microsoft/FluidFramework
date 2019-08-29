/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorTrackingService } from "@prague/protocol-definitions";
import * as Sentry from "@sentry/node";

export class NodeErrorTrackingService implements IErrorTrackingService {

    constructor(endpoint: string) {
        Sentry.init({ dsn: endpoint });
    }

    public track<T>(func: () => T): T {
        return func();
    }

    public captureException(error: any): string {
        return Sentry.captureException(error);
    }
}
