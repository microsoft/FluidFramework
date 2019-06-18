/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITrace } from "@prague/container-definitions";

// Message to indicate successful round trip.
export const RoundTrip = "tripComplete";

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
