/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Accepted header keys for requests coming to the Loader
 */
export var LoaderHeader;
(function (LoaderHeader) {
    /**
     * Override the Loader's default caching behavior for this container.
     */
    LoaderHeader["cache"] = "fluid-cache";
    LoaderHeader["clientDetails"] = "fluid-client-details";
    LoaderHeader["executionContext"] = "execution-context";
    /**
     * Start the container in a paused, unconnected state. Defaults to false
     */
    LoaderHeader["pause"] = "pause";
    LoaderHeader["reconnect"] = "fluid-reconnect";
    LoaderHeader["sequenceNumber"] = "fluid-sequence-number";
    /**
     * One of the following:
     * null or "null": use ops, no snapshots
     * undefined: fetch latest snapshot
     * otherwise, version sha to load snapshot
     */
    LoaderHeader["version"] = "version";
})(LoaderHeader || (LoaderHeader = {}));
//# sourceMappingURL=loader.js.map