"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiUrlResolver = exports.tinyliciousUrls = exports.dockerUrls = void 0;
const local_driver_1 = require("@fluidframework/local-driver");
const test_runtime_utils_1 = require("@fluidframework/test-runtime-utils");
const odspUrlResolver_1 = require("./odspUrlResolver");
exports.dockerUrls = {
    hostUrl: "http://localhost:3000",
    ordererUrl: "http://localhost:3003",
    storageUrl: "http://localhost:3001",
};
const defaultTinyliciousPort = 7070;
const tinyliciousUrls = (options) => {
    var _a;
    const port = (_a = options.tinyliciousPort) !== null && _a !== void 0 ? _a : defaultTinyliciousPort;
    return {
        hostUrl: `http://localhost:${port}`,
        ordererUrl: `http://localhost:${port}`,
        storageUrl: `http://localhost:${port}`,
    };
};
exports.tinyliciousUrls = tinyliciousUrls;
function getUrlResolver(options) {
    switch (options.mode) {
        case "docker":
            return new test_runtime_utils_1.InsecureUrlResolver(exports.dockerUrls.hostUrl, exports.dockerUrls.ordererUrl, exports.dockerUrls.storageUrl, options.tenantId, options.bearerSecret);
        case "r11s":
            return new test_runtime_utils_1.InsecureUrlResolver(options.fluidHost, options.fluidHost.replace("www", "alfred"), options.fluidHost.replace("www", "historian"), options.tenantId, options.bearerSecret);
        case "tinylicious": {
            const urls = exports.tinyliciousUrls(options);
            return new test_runtime_utils_1.InsecureUrlResolver(urls.hostUrl, urls.ordererUrl, urls.storageUrl, "tinylicious", options.bearerSecret);
        }
        case "spo":
        case "spo-df":
            return new odspUrlResolver_1.OdspUrlResolver(options.server, { accessToken: options.odspAccessToken });
        default: // Local
            return new local_driver_1.LocalResolver();
    }
}
class MultiUrlResolver {
    constructor(documentId, rawUrl, options, useLocalResolver = false) {
        this.documentId = documentId;
        this.rawUrl = rawUrl;
        this.options = options;
        this.useLocalResolver = useLocalResolver;
        if (this.useLocalResolver) {
            this.urlResolver = new local_driver_1.LocalResolver();
        }
        else {
            this.urlResolver = getUrlResolver(options);
        }
    }
    async getAbsoluteUrl(resolvedUrl, relativeUrl) {
        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }
        return `${this.rawUrl}/${this.documentId}/${url}`;
    }
    async resolve(request) {
        return this.urlResolver.resolve(request);
    }
    async createRequestForCreateNew(fileName) {
        if (this.useLocalResolver) {
            return this.urlResolver.createCreateNewRequest(fileName);
        }
        switch (this.options.mode) {
            case "r11s":
            case "docker":
            case "tinylicious":
                return this.urlResolver.createCreateNewRequest(fileName);
            case "spo":
            case "spo-df":
                return this.urlResolver.createCreateNewRequest(fileName);
            default: // Local
                return this.urlResolver.createCreateNewRequest(fileName);
        }
    }
}
exports.MultiUrlResolver = MultiUrlResolver;
//# sourceMappingURL=multiResolver.js.map