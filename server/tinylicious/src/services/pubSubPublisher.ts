/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISubscriber, IPubSub } from "@fluidframework/server-memory-orderer";

export class PubSubPublisher implements IPubSub {
    constructor(private readonly io: SocketIO.Server) {}

    // Publish to all sockets subscribed to this topic in the SocketIO server.
    public publish(topic: string, event: string, ...args: any[]): void {
        this.io.to(topic).emit(event, ...args);
    }

    // The sockets directly subscribe to the topic in `alfred` when document is connected. So, we do
    // nothing here.
    public subscribe(topic: string, subscriber: ISubscriber): void {}

    // The sockets directly unsubscibe when the client disconnects. So, we do nothing here.
    public unsubscribe(topic: string, subscriber: ISubscriber): void {}
}
