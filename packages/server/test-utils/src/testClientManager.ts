/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, ISignalClient } from "@microsoft/fluid-protocol-definitions";
import { IClientManager } from "@microsoft/fluid-server-services-core";

export class TestClientManager implements IClientManager {

    public async addClient(tenantId: string, documentId: string, clientId: string, details: IClient): Promise<void> {
        return;
    }

    public async removeClient(tenantId: string, documentId: string, clientId: string): Promise<void> {
        return;
    }

    public async getClients(tenantId: string, documentId: string): Promise<ISignalClient[]> {
        return [];
    }
}
