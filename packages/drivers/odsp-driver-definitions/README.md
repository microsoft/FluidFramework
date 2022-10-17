# @fluidframework/odsp-driver-definitions

Definitions for @fluidframework/odsp-driver package.
Currently it contains all the contracts for driver factory.

Though the host is responsible for implementing the IPersistedCache, snapshot cached entries will be disregarded if they are older than 5 days, per the maximumCacheDurationMs policy on IDocumentStorageServicePolicies
