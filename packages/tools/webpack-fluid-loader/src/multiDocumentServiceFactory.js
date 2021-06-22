"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentServiceFactory = exports.deltaConns = void 0;
const server_local_server_1 = require("@fluidframework/server-local-server");
const driver_utils_1 = require("@fluidframework/driver-utils");
const local_driver_1 = require("@fluidframework/local-driver");
const odsp_driver_1 = require("@fluidframework/odsp-driver");
const routerlicious_driver_1 = require("@fluidframework/routerlicious-driver");
const server_services_client_1 = require("@fluidframework/server-services-client");
const test_runtime_utils_1 = require("@fluidframework/test-runtime-utils");
const uuid_1 = require("uuid");
exports.deltaConns = new Map();
function getDocumentServiceFactory(documentId, options, odspPersistantCache) {
    var _a;
    const deltaConn = (_a = exports.deltaConns.get(documentId)) !== null && _a !== void 0 ? _a : server_local_server_1.LocalDeltaConnectionServer.create(new local_driver_1.LocalSessionStorageDbFactory(documentId));
    exports.deltaConns.set(documentId, deltaConn);
    const getUser = () => ({
        id: uuid_1.v4(),
        name: server_services_client_1.getRandomName(),
    });
    let routerliciousTokenProvider;
    // tokenprovider and routerlicious document service will not be called for local and spo server.
    if (options.mode === "tinylicious") {
        routerliciousTokenProvider = new test_runtime_utils_1.InsecureTokenProvider("12345", getUser());
    }
    else {
        routerliciousTokenProvider = new test_runtime_utils_1.InsecureTokenProvider(options.tenantSecret, getUser());
    }
    return driver_utils_1.MultiDocumentServiceFactory.create([
        new local_driver_1.LocalDocumentServiceFactory(deltaConn),
        // TODO: web socket token
        new odsp_driver_1.OdspDocumentServiceFactory(async () => options.mode === "spo" || options.mode === "spo-df" ? options.odspAccessToken : undefined, async () => options.mode === "spo" || options.mode === "spo-df" ? options.pushAccessToken : undefined, odspPersistantCache),
        new routerlicious_driver_1.RouterliciousDocumentServiceFactory(routerliciousTokenProvider),
    ]);
}
exports.getDocumentServiceFactory = getDocumentServiceFactory;
//# sourceMappingURL=multiDocumentServiceFactory.js.map