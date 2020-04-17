/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProducer } from "./queue";

/**
 * Combines multiple producers to one.
 */
export class CombinedProducer implements IProducer {
    constructor(private readonly producers: IProducer[]) {
    }

    public async send(messages: object[], tenantId: string, documentId: string): Promise<any> {
        const sendP = [];
        for (const producer of this.producers) {
            sendP.push(producer.send(messages, tenantId, documentId));
        }
        return Promise.all(sendP);
    }

    public async close(): Promise<void> {
        const closeP = [];
        for (const producer of this.producers) {
            closeP.push(producer.close());
        }
        await Promise.all(closeP);
    }

    public on(event: "connected" | "produced" | "error", listener: (...args: any[]) => void): this {
        return this;
    }

    public once(event: "connected" | "produced" | "error", listener: (...args: any[]) => void): this {
        return this;
    }
}
