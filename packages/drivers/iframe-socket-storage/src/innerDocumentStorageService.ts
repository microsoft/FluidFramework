/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { DocumentStorageServiceProxy } from "@microsoft/fluid-driver-utils";

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class InnerDocumentStorageService extends DocumentStorageServiceProxy {
    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const versions = await this.internalStorageService.getVersions(versionId, count);
        if (versions === undefined) {
            return [];
        }
        return versions;
    }
}
