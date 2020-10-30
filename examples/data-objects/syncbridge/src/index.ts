export * from './bridge';
export * from './test';
export * from './channel/SyncBridgeChannel';
export * from './SyncBridgeTypes';

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct"

import { TestComponent } from './test';

export { TestComponent } from './test';


export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    TestComponent.name,
    new Map([
        [TestComponent.name, Promise.resolve(TestComponent.getFactory())]
    ])
)

