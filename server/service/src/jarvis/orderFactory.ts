/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { KafkaOrderer, KafkaOrdererFactory } from "./kafkaOrderer";

export class OrdererManager {
    constructor(private kafkaFactory?: KafkaOrdererFactory) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<KafkaOrderer> {
        return this.kafkaFactory.create(tenantId, documentId);
    }
}
