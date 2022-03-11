# @fluidframework/driver-web-cache

This package provides an implementation of the `IPersistedCache` interface in the odsp-driver package. This cache enables
storing of user content on the user's machine in order to provide faster boot experiences when opening the same Fluid
containers more than once. This implementation has a dependency on indexeddb, so it is intended to only be used in a browser
context.

## Usage

```typescript
import { FluidCache } from '@fluidframework/driver-web-cache';

new FluidCache({
          partitionKey: userId,
          logger,
          maxCacheItemAge
        })
```

### Parameters

- `partitionKey` - Used to determine what partition of the cache is being used, and can prevent multiple users on the
   same machine from sharing a snapshot cache. If you absolutely know that users will not share the cache,
   can also be set to `null`. Currently optional, but is proposed to be required in the next major bump.
   The recommendation is to use this key to differentiate users for the cache data.
- `logger` - An optional implementation of the logger contract where diagnostic data  can be logged.
- `maxCacheItemAge` - The cache tracks a timestamp with each entry. This flag specifies the maximum age (in milliseconds)
   for a cache entry to be used. This flag does not control when cached content is deleted since different scenarios and
   applications may have different staleness thresholds for the same data.

## Clearing cache entries

Whenever any Fluid content is loaded with the web cache enabled, a task is scheduled to clear out all "stale" cache
entries. This task is scheduled with the `setIdleCallback` browser API. We define stale cache entries as any cache
entries that have not been used (read or written to) within the last 4 weeks. The cache is cleared of all stale cache
entries corresponding to all documents, not just the ones corresponding to the Fluid document being loaded.

The `deleteFluidCacheIndexDbInstance` API that an application can use to clear out the entire contents of the snapshot
cache at any time. We recommend calling this API when the user explicitly signs out. Hosting applications
are on point for ensuring responsible usage of the snapshot caching capability to still meet any relevant
customer promises, such as clearing out storage when appropriate or disabling snapshot caching under certain circumstances,
such as when it is known the user is logged in to a public computer.


```typescript
import { deleteFluidCacheIndexDbInstance } from '@fluidframework/driver-web-cache';

  // We put a catch here because Firefox Incognito will throw an error here. This is why we claim this method is a "best effort", since sometimes the browser won't let us access storage
deleteFluidCacheIndexDbInstance().catch(() => {});
```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
