/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IProducer } from "@microsoft/fluid-server-services-core";

/**
 * Kafka simulation that just drops the message
 */
export class DummyKafka implements IProducer {

    constructor() {
    }

    public async send(messages: object[], topic: string): Promise<any> {
        return;
    }

    public async close(): Promise<void> {
        return;
    }

    public on(event: "connected" | "produced" | "error", listener: (...args: any[]) => void): this {
        return this;
    }

    public once(event: "connected" | "produced" | "error", listener: (...args: any[]) => void): this {
        return this;
    }
}
