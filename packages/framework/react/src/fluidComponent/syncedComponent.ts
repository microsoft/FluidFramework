/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@fluidframework/aqueduct";
import {
    IComponent,
    IComponentHandle,
} from "@fluidframework/component-core-interfaces";
import { IEvent } from "@fluidframework/common-definitions";
import { SharedMap, ISharedMap } from "@fluidframework/map";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import {
    FluidComponentMap,
    SyncedStateConfig,
    ISyncedStateConfig,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISyncedState,
} from "../interface";
import {
    generateComponentSchema,
    setComponentSchema,
    getComponentSchema,
} from "../helpers";

export abstract class SyncedComponent<
    P extends IComponent = object,
    S = undefined,
    E extends IEvent = IEvent
> extends PrimedComponent<P, S, E>
    implements IComponentHTMLView {
    private readonly syncedStateConfig: SyncedStateConfig = new Map();
    private readonly fluidComponentMap: FluidComponentMap = new Map();
    private internalSyncedState: ISharedMap | undefined;
    private readonly syncedStateDirectoryId = "syncedState";

    public get IComponentHTMLView() {
        return this;
    }

    protected async componentInitializingFirstTime(props?: any): Promise<void> {
        await super.componentInitializingFirstTime(props);
        // Initialize our synced state map for the first time using our
        // syncedStateConfig values
        await this.initializeStateFirstTime();
    }

    protected async componentInitializingFromExisting(): Promise<void> {
        await super.componentInitializingFromExisting();
        // Load our existing state values to be ready for the render lifecycle
        await this.initializeStateFromExisting();
    }

    public get syncedState(): ISyncedState {
        if (!this.internalSyncedState) {
            throw new Error(this.getUninitializedErrorString(`syncedState`));
        }
        return {
            set: this.internalSyncedState.set.bind(this.internalSyncedState),
            get: this.internalSyncedState.get.bind(this.internalSyncedState),
            addValueChangedListener: (callback) => {
                if (!this.internalSyncedState) {
                    throw new Error(this.getUninitializedErrorString(`syncedState`));
                }
                this.internalSyncedState.on("valueChanged", callback);
            },
        };
    }

    public get dataProps() {
        return {
            runtime: this.runtime,
            fluidComponentMap: this.fluidComponentMap,
        };
    }

    public setFluidConfig<
        SV extends IFluidFunctionalComponentViewState,
        SF extends IFluidFunctionalComponentFluidState
    >(key: string, value: ISyncedStateConfig<SV, SF>) {
        this.syncedStateConfig.set(key, value);
    }

    public setConfig<SV>(key: string, value: ISyncedStateConfig<SV, SV>) {
        this.syncedStateConfig.set(key, value);
    }

    public getConfig(key: string) {
        return this.syncedStateConfig.get(key);
    }

    public render(element: HTMLElement) {
        throw Error("Render function was not implemented");
    }

    private async initializeStateFirstTime() {
        this.internalSyncedState = SharedMap.create(this.runtime, this.syncedStateDirectoryId);
        this.internalSyncedState.register();
        for (const stateConfig of this.syncedStateConfig.values()) {
            const {
                syncedStateId,
                fluidToView,
                viewToFluid,
                defaultViewState,
            } = stateConfig;
            // Add the SharedMap to store the fluid state
            const storedFluidState = SharedMap.create(this.runtime);
            // Add it to the fluid component map so that it will have a listener added to it once
            // we enter the render lifecycle
            this.fluidComponentMap.set(storedFluidState.handle.path, {
                component: storedFluidState,
                isRuntimeMap: true,
            });
            // Add the state to our map of synced states so that we can load it later for persistence
            this.syncedState.set(
                `syncedState-${syncedStateId}`,
                storedFluidState.handle,
            );
            // Initialize any DDS' needed for the state or fetch any values from the root if they are stored
            // on the root under a different key
            for (const key of fluidToView.keys()) {
                const fluidKey = key as string;
                const rootKey = fluidToView.get(fluidKey)?.rootKey;
                const createCallback = fluidToView.get(fluidKey)
                    ?.sharedObjectCreate;
                if (createCallback) {
                    const sharedObject = createCallback(this.runtime);
                    this.fluidComponentMap.set(sharedObject.handle.path, {
                        component: sharedObject,
                        listenedEvents: fluidToView?.get(fluidKey)
                            ?.listenedEvents || ["valueChanged"],
                    });
                    storedFluidState.set(fluidKey, sharedObject.handle);
                    if (rootKey) {
                        this.root.set(rootKey, sharedObject.handle);
                    }
                } else if (rootKey) {
                    storedFluidState.set(fluidKey, this.root.get(rootKey));
                }
            }

            // Generate our schema and store it, so that we don't need to parse our maps each time
            const componentSchema = generateComponentSchema(
                this.runtime,
                defaultViewState,
                fluidToView,
                viewToFluid,
            );
            const componentSchemaHandles = {
                fluidMatchingMapHandle: componentSchema.fluidMatchingMap
                    .handle as IComponentHandle<SharedMap>,
                viewMatchingMapHandle: componentSchema.viewMatchingMap
                    .handle as IComponentHandle<SharedMap>,
                storedHandleMapHandle: componentSchema.storedHandleMap
                    .handle as IComponentHandle<SharedMap>,
            };
            this.fluidComponentMap.set(
                componentSchema.fluidMatchingMap.handle.path,
                {
                    component: componentSchema.fluidMatchingMap,
                    isRuntimeMap: true,
                },
            );
            this.fluidComponentMap.set(
                componentSchema.viewMatchingMap.handle.path,
                {
                    component: componentSchema.viewMatchingMap,
                    isRuntimeMap: true,
                },
            );
            this.fluidComponentMap.set(
                componentSchema.storedHandleMap.handle.path,
                {
                    component: componentSchema.storedHandleMap,
                    isRuntimeMap: true,
                },
            );

            setComponentSchema(
                syncedStateId,
                this.syncedState,
                componentSchemaHandles,
            );
        }
    }

    private async initializeStateFromExisting() {
        // Fetch our synced state that stores all of our information to re-initialize the view state
        this.internalSyncedState = await this.runtime.getChannel(this.syncedStateDirectoryId) as ISharedMap;
        // Reload the stored state for each config provided
        for (const stateConfig of this.syncedStateConfig.values()) {
            const { syncedStateId, fluidToView } = stateConfig;
            // Fetch this specific view's state using the syncedStateId
            const storedFluidStateHandle = this.syncedState.get<IComponentHandle<ISharedMap>>(
                `syncedState-${syncedStateId}`,
            );
            if (storedFluidStateHandle === undefined) {
                throw new Error(
                    this.getUninitializedErrorString(
                        `syncedState-${syncedStateId}`,
                    ),
                );
            }
            const storedFluidState = await storedFluidStateHandle.get();
            // Add it to the fluid component map so that it will have a listener added to it once
            // we enter the render lifecycle
            this.fluidComponentMap.set(storedFluidStateHandle.path, {
                component: storedFluidState,
                isRuntimeMap: true,
            });
            // If the view is using any Fluid Components or SharedObjects, asynchronously fetch them
            // from their stored handles
            for (const key of fluidToView.keys()) {
                const fluidKey = key as string;
                const rootKey = fluidToView.get(fluidKey)?.rootKey;
                const createCallback = fluidToView.get(fluidKey)
                    ?.sharedObjectCreate;
                if (createCallback) {
                    const handle = rootKey
                        ? this.root.get(rootKey)
                        : storedFluidState.get(fluidKey);
                    if (handle === undefined) {
                        throw new Error(
                            `Failed to find ${fluidKey} in synced state`,
                        );
                    }
                    this.fluidComponentMap.set(handle.path, {
                        component: await handle.get(),
                        listenedEvents: fluidToView?.get(fluidKey)
                            ?.listenedEvents || ["valueChanged"],
                    });
                } else {
                    const storedValue = rootKey
                        ? this.root.get(rootKey)
                        : storedFluidState.get(fluidKey);
                    const handle = storedValue?.IComponentHandle;
                    if (handle) {
                        this.fluidComponentMap.set(handle.path, {
                            component: await handle.get(),
                            listenedEvents: fluidToView?.get(fluidKey)
                                ?.listenedEvents || ["valueChanged"],
                        });
                    }
                }
            }
            const componentSchemaHandles = getComponentSchema(
                syncedStateId,
                this.syncedState,
            );
            if (componentSchemaHandles === undefined) {
                throw new Error(
                    this.getUninitializedErrorString(
                        `componentSchema-${syncedStateId}`,
                    ),
                );
            }
            this.fluidComponentMap.set(
                componentSchemaHandles.fluidMatchingMapHandle.path,
                {
                    component: await componentSchemaHandles.fluidMatchingMapHandle.get(),
                    isRuntimeMap: true,
                },
            );
            this.fluidComponentMap.set(
                componentSchemaHandles.viewMatchingMapHandle.path,
                {
                    component: await componentSchemaHandles.viewMatchingMapHandle.get(),
                    isRuntimeMap: true,
                },
            );
            this.fluidComponentMap.set(
                componentSchemaHandles.storedHandleMapHandle.path,
                {
                    component: await componentSchemaHandles.storedHandleMapHandle.get(),
                    isRuntimeMap: true,
                },
            );
        }
    }
}
