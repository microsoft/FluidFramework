/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorTrackingService } from "@prague/container-definitions";
import * as raven from "raven";

export class NodeErrorTrackingService implements IErrorTrackingService {

    constructor(private endpoint: string) {
    }

    public track(func: () => void) {
        raven.config(this.endpoint).install();
        raven.context(func);
    }
}
