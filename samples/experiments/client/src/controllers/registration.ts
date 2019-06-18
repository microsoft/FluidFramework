/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as prague from "@prague/routerlicious";

export function register(routerlicious: string, historian: string, tenantId: string) {
    prague.api.socketStorage.registerAsDefault(routerlicious, historian, tenantId);
}
