/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorTrackingService } from "@prague/protocol-definitions";
import * as Sentry from "@sentry/node";

export class NodeErrorTrackingService implements IErrorTrackingService {

    constructor(endpoint: string, service: string) {
        Sentry.init({ dsn: endpoint });
        Sentry.configureScope((scope) => {
            scope.setTag("service", service);
          });
    }

    public track<T>(func: () => T): T {
        return func();
    }

    public captureException(error: any): string {
        return Sentry.captureException(error);
    }

    public async flush(timeout?: number | undefined): Promise<boolean> {
        return Sentry.flush(timeout);
    }
}
