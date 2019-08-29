/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const settings = {
    alfred: {
        topic: "rawdeltas",
    },
    deli: {
        topics: {
            receive: "rawdeltas",
            send: "deltas"
        },
    },
    eventHub: {
        endpoint: "",
    },
    mongo: {
        collectionNames: {
            deltas: "deltas",
            documents: "documents",
            partitions: "partitions",
            tenants: "tenants",
            nodes: "nodes",
            reservations: "reservations"
        },
        endpoint: "",
    },
    redis: {
        host: "",
        key: "",
        port: 6380
    }
}
