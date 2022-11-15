# @fluid-internal/test-gc-sweep-tests

## Overview

The goal of these tests is to enable testing of the GC sweep infrastructure. Ideally, these tests should run for a few
minutes. This test is trying to imitate what might actually happen in the real world and provide enough randomness that
it will likely catch issues before they reach out to customers.

## Work in progress

Currently this package is still under development and may experience drastic changes.

## Quick rundown

Warning: As this package is rapidly changing, this section may very quickly become out of date.
- The test starts at gcSweepTest.spec.ts
    - Currently, it only runs one test
    - It runs by creating a ContainerManager, HandleTracker, and FluidObjectTracker.
    - Using these 3 objects, the test can get all the necessary objects to create all the different actions.
- Main Actions
    - loadNewContainer
    - closeRandomContainer - needs live containers
    - createDataStoreForRandomContainer - needs live containers
    - referenceRandomHandle - needs live containers
    - unreferenceRandomHandle - needs live containers && stored handles
- HandleTracker
    - Responsible for recording where handles are stored in the global document
    - Needs to be manually updated
    - Used when removing handles to find a DDS that actually has a handle that can be removed.
- FluidObjectTracker
    - Responsible for tracking paths to DataStores and DDSes.
    - Represents the state of the document
    - Tracks where all the DDSes that can store handles are
- ContainerManager
    - responsible for the lifetime of Containers.
    - Instead of returning a container on random get, ContainerManager returns a ContainerDataObjectManager
- ContainerDataObjectManager
    - responsible for creating DataObjects
    - retrieving handles
    - adding handles
    - removing handles
- DataObjectWithManyDDSes extends BaseTestDataObject extends DataObject
    - Responsible for adding a handle to its DDSes
        - This is encapsulated in the HandleManager
    - Exposing all its channel ids so they are known to the test
    - Exposing all its channel ids that can process DDSes so they are known to the test
- HandleManager
    - Responsible for adding and removing handles for channels in a DataObject
        - Adds handles to a random DDS
        - Removes handles from a specified DDS
    - When removing a handle, it expects a handle to be removed, otherwise it throws.
    - The specific logic to add and remove handles from a type of DDS is implemented as an IHandleOpManager
- IHandleOpManager
    - Responsible for adding and removing handles for a specific type of channel.
    - Adds a handle - may return a handle if adding replaces the handle.
    - Removes a handle randomly - not always guaranteed to remove a specific handle i.e. a ConsensusQueue

## Build and Run for this test package

- `npm run test:build`
