/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as kafkaTypes from "node-rdkafka";

let tryImport = false;
let nodeRdkafkaModule: typeof kafkaTypes | undefined;

// Imports a module inside a try-catch block and swallows the error if import fails.
//
// The native dependency of node-rdkafka throws an error when installing in one environment (e.g., macOS) and running
// inside another (e.g., docker ubuntu). The issue only occurs because we volume mount code directly into docker
// for local dev flow. Using a pre-built image works fine (https://github.com/Blizzard/node-rdkafka/issues/315).
// Because of this limitation, currently we cannot use node-rdkafka in local dev flow. So locally kafka config should
// always point to kafka-node library. Production code can use either one of those.
//
// node-rdkafka sets up an AtExit callback to call RdKafka::wait_destroyed to cleanup.
// However, on windows it AVs if we never create an rdkafka instance.
// librdkafka lazy initializes the global mutex, and it wouldn't be initialized if no rdkafka is created,
// so then the cleanup callback tries to access the mutex and crashes.
//
// So we will also lazy import node-rdkafka only if we intend to use it.
export function tryImportNodeRdkafka() {
    if (!tryImport) {
        tryImport = true;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            nodeRdkafkaModule = require("node-rdkafka");
        } catch (e) {
        }
    }
    return nodeRdkafkaModule;
}
