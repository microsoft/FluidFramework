/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export var LoaderCachingPolicy;
(function (LoaderCachingPolicy) {
    /**
     * The loader should not implement any prefetching or caching policy.
     */
    LoaderCachingPolicy[LoaderCachingPolicy["NoCaching"] = 0] = "NoCaching";
    /**
     * The loader should implement prefetching policy, i.e. it should prefetch resources from the latest snapshot.
     */
    LoaderCachingPolicy[LoaderCachingPolicy["Prefetch"] = 1] = "Prefetch";
})(LoaderCachingPolicy || (LoaderCachingPolicy = {}));
//# sourceMappingURL=storage.js.map