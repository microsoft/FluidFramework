/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorTrackingService } from "@prague/container-definitions";
import * as raven from "raven-js";

const sentryDSN = "";

export class BrowserErrorTrackingService implements IErrorTrackingService {
    private ravenContext: raven.RavenStatic;

    constructor() {
        this.ravenContext = raven.config(sentryDSN).install();
    }

    public track(func: () => void) {
        this.ravenContext.context(func);
    }
}
