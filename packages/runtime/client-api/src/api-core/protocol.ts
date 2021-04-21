/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITrace } from "@fluidframework/protocol-definitions";

export interface ILatencyMessage {
    // Latency traces.
    traces: ITrace[];
}

export interface IPingMessage {
    // Whether ping is acked or not.
    acked: boolean;

    // Traces for the ping.
    traces: ITrace[];
}
