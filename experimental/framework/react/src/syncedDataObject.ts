/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject, DataObjectTypes } from "@fluidframework/aqueduct";
import {
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { SharedMap, ISharedMap } from "@fluidframework/map";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

import {
    FluidObjectMap,
    SyncedStateConfig,
    ISyncedStateConfig,
    IViewState,
    IFluidState,
    ISyncedState,
} from "./interface";
import {
    generateFluidObjectSchema,
    setSchema,
    getSchema,
} from "./helpers";

/**
 * SyncedDataObject is a base class for Fluid data objects with views. It extends DataObject.
 * In addition to the root and task manager, the SyncedDataObject also provides a syncedStateConfig
 * and assures that the syncedState will be initialized according the config by the time the view
 * is rendered.
 */
export abstract class SyncedDataObject<I extends DataObjectTypes = DataObjectTypes> extends DataObject<I> {
    private readonly syncedStateConfig: SyncedStateConfig = new Map();
    private readonly fluidObjectMap: FluidObjectMap = new Map();
    private readonly syncedStateDirectoryId = "syncedState";
    private internalSyncedState: ISharedMap | undefined;

    /**
     * Runs the first time the SyncedDataObject is generated and sets up all necessary data structures for the view
     * To extend this function, please call super() prior to adding to functionality to ensure correct initializing
     */
    protected async initializingFirstTime(): Promise<void> {
        // Initialize our synced state map for the first time using our
        // syncedStateConfig values
        await this.initializeStateFirstTime();
    }

    /**
     * Runs any time the SyncedDataObject is rendered again. It sets up all necessary data structures for the view,
     * along with any additional ones that may have been added due to user behavior
     * To extend this function, please call super() prior to adding to functionality to ensure correct initializing
     */
    protected async initializingFromExisting(): Promise<void> {
        // Load our existing state values to be ready for the render lifecycle
        await this.initializeStateFromExisting();
    }

    /**
     * Returns an interface to interact with the stored synced state for the SyncedDataObject.
     * Views can get and fetch values from it based on their syncedStateId to retrieve their view-specific information.
     * They can also attach listeners using the addValueChangedListener
     */
    public get syncedState(): ISyncedState {
        if (this.internalSyncedState === undefined) {
            throw new Error(this.getUninitializedErrorString(`syncedState`));
        }
        return {
            set: this.internalSyncedState.set.bind(this.internalSyncedState),
            get: this.internalSyncedState.get.bind(this.internalSyncedState),
            addValueChangedListener: (callback) => {
                if (this.internalSyncedState === undefined) {
                    throw new Error(
                        this.getUninitializedErrorString(`syncedState`),
                    );
                }
                this.internalSyncedState.on("valueChanged", callback);
            },
        };
    }

    /**
     * Returns the data props used by the view to manage the different DDSes and add any new ones
     */
    public get dataProps() {
        return {
            // The return type is defined explicitly here to prevent TypeScript from generating dynamic imports
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            runtime: this.runtime as IFluidDataStoreRuntime,
            fluidObjectMap: this.fluidObjectMap,
        };
    }

    /**
     * Set values to the syncedStateConfig where the view and Fluid states have the same values defined by S.
     * Each view with a unique syncedStateId needs its own value in the syncedStateConfig.
     * @param key - The syncedStateId that maps to the view that will be using these definitions
     * @param value - The config value containing the syncedStateId and the fluidToView and viewToFluid maps
     */
    public setConfig<S>(key: string, value: ISyncedStateConfig<S, S>) {
        this.syncedStateConfig.set(key, value);
    }

    /**
     * Set values to the syncedStateConfig with different view and Fluid state definitions.
     * Each view with a unique syncedStateId needs its own value in the syncedStateConfig,
     * with SV being the view state definition and SF being the Fluid state definition.
     * @param key - The syncedStateId that maps to the view that will be using these definitions
     * @param value - The config value containing the syncedStateId and the fluidToView and viewToFluid maps
     * that establish the relationship between SV and SF
     */
    public setFluidConfig<
        SV extends IViewState,
        SF extends IFluidState
    >(key: string, value: ISyncedStateConfig<SV, SF>) {
        this.syncedStateConfig.set(key, value);
    }

    /**
     * Get a config for a specific view with the key as its syncedStateId
     * @param key - The syncedStateId to get the config for
     */
    public getConfig(key: string) {
        return this.syncedStateConfig.get(key);
    }

    private async initializeStateFirstTime() {
        this.internalSyncedState = SharedMap.create(
            this.runtime,
            this.syncedStateDirectoryId,
        );
        this.internalSyncedState.bindToContext();
        for (const stateConfig of this.syncedStateConfig.values()) {
            const {
                syncedStateId,
                fluidToView,
                viewToFluid,
                defaultViewState,
            } = stateConfig;
            // Add the SharedMap to store the Fluid state
            const storedFluidState = SharedMap.create(this.runtime);
            // Add it to the Fluid object map so that it will have a listener added to it once
            // we enter the render lifecycle
            this.fluidObjectMap.set(storedFluidState.handle.absolutePath, {
                fluidObject: storedFluidState,
                isRuntimeMap: true,
            });
            // Add the state to our map of synced states so that we can load it later for persistence
            this.syncedState.set(
                `syncedState-${syncedStateId}`,
                storedFluidState.handle,
            );
            // Initialize any DDSes needed for the state or fetch any values from the root if they are stored
            // on the root under a different key
            for (const [key, value] of fluidToView.entries()) {
                const fluidKey = key as string;
                const rootKey = value.rootKey;
                const createCallback = value.sharedObjectCreate;
                if (createCallback !== undefined) {
                    const sharedObject = createCallback(this.runtime);
                    this.fluidObjectMap.set(sharedObject.handle.absolutePath, {
                        fluidObject: sharedObject,
                        listenedEvents: value.listenedEvents ?? ["valueChanged"],
                    });
                    storedFluidState.set(fluidKey, sharedObject.handle);
                    if (rootKey !== undefined) {
                        this.root.set(rootKey, sharedObject.handle);
                    }
                } else if (rootKey !== undefined) {
                    storedFluidState.set(fluidKey, this.root.get(rootKey));
                }
            }

            // Generate our schema and store it, so that we don't need to parse our maps each time
            const schema = generateFluidObjectSchema(
                this.runtime,
                defaultViewState,
                fluidToView,
                viewToFluid,
            );
            const schemaHandles = {
                fluidMatchingMapHandle: schema.fluidMatchingMap
                    .handle as IFluidHandle<SharedMap>,
                viewMatchingMapHandle: schema.viewMatchingMap
                    .handle as IFluidHandle<SharedMap>,
                storedHandleMapHandle: schema.storedHandleMap
                    .handle as IFluidHandle<SharedMap>,
            };
            this.fluidObjectMap.set(
                schema.fluidMatchingMap.handle.absolutePath,
                {
                    fluidObject: schema.fluidMatchingMap,
                    isRuntimeMap: true,
                },
            );
            this.fluidObjectMap.set(
                schema.viewMatchingMap.handle.absolutePath,
                {
                    fluidObject: schema.viewMatchingMap,
                    isRuntimeMap: true,
                },
            );
            this.fluidObjectMap.set(
                schema.storedHandleMap.handle.absolutePath,
                {
                    fluidObject: schema.storedHandleMap,
                    isRuntimeMap: true,
                },
            );

            setSchema(
                syncedStateId,
                this.syncedState,
                schemaHandles,
            );
        }
    }

    private async initializeStateFromExisting() {
        // Fetch our synced state that stores all of our information to re-initialize the view state
        this.internalSyncedState = (await this.runtime.getChannel(
            this.syncedStateDirectoryId,
        )) as ISharedMap;
        // Reload the stored state for each config provided
        for (const stateConfig of this.syncedStateConfig.values()) {
            const { syncedStateId, fluidToView } = stateConfig;
            // Fetch this specific view's state using the syncedStateId
            const storedFluidStateHandle = this.syncedState.get<
                IFluidHandle<ISharedMap>
            >(`syncedState-${syncedStateId}`);
            if (storedFluidStateHandle === undefined) {
                throw new Error(
                    this.getUninitializedErrorString(
                        `syncedState-${syncedStateId}`,
                    ),
                );
            }
            const storedFluidState = await storedFluidStateHandle.get();
            // Add it to the Fluid object map so that it will have a listener added to it once
            // we enter the render lifecycle
            this.fluidObjectMap.set(storedFluidStateHandle.absolutePath, {
                fluidObject: storedFluidState,
                isRuntimeMap: true,
            });
            // If the view is using any Fluid data stores or SharedObjects, asynchronously fetch them
            // from their stored handles
            for (const [key, value] of fluidToView.entries()) {
                const fluidKey = key as string;
                const rootKey = value.rootKey;
                const createCallback = value.sharedObjectCreate;
                if (createCallback !== undefined) {
                    const handle = rootKey !== undefined
                        ? this.root.get(rootKey)
                        : storedFluidState.get(fluidKey);
                    if (handle === undefined) {
                        throw new Error(
                            `Failed to find ${fluidKey} in synced state`,
                        );
                    }
                    this.fluidObjectMap.set(handle.absolutePath, {
                        fluidObject: await handle.get(),
                        listenedEvents: value.listenedEvents ?? ["valueChanged"],
                    });
                } else {
                    const storedValue = rootKey !== undefined
                        ? this.root.get(rootKey)
                        : storedFluidState.get(fluidKey);
                    const handle = storedValue?.IFluidHandle;
                    if (handle !== undefined) {
                        this.fluidObjectMap.set(handle.absolutePath, {
                            fluidObject: await handle.get(),
                            listenedEvents: value.listenedEvents ?? [
                                "valueChanged",
                            ],
                        });
                    }
                }
            }
            const schemaHandles = getSchema(
                syncedStateId,
                this.syncedState,
            );
            if (schemaHandles === undefined) {
                throw new Error(
                    this.getUninitializedErrorString(
                        `schema-${syncedStateId}`,
                    ),
                );
            }
            this.fluidObjectMap.set(
                schemaHandles.fluidMatchingMapHandle.absolutePath,
                {
                    fluidObject: await schemaHandles.fluidMatchingMapHandle.get(),
                    isRuntimeMap: true,
                },
            );
            this.fluidObjectMap.set(
                schemaHandles.viewMatchingMapHandle.absolutePath,
                {
                    fluidObject: await schemaHandles.viewMatchingMapHandle.get(),
                    isRuntimeMap: true,
                },
            );
            this.fluidObjectMap.set(
                schemaHandles.storedHandleMapHandle.absolutePath,
                {
                    fluidObject: await schemaHandles.storedHandleMapHandle.get(),
                    isRuntimeMap: true,
                },
            );
        }
    }
}
