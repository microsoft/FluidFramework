# @fluidframework/odsp-driver-definitions

Definitions for @fluidframework/odsp-driver pakcage.
Currently it contains all the contracts for driver factory.

Though the host is responsible for implementing the IPersistedCache, snapshot entries will only be persisted for 2 days. The ODSP driver will remove all entries if it recieves a snapshot entry two days or older.