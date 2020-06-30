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

/**
 * SyncedComponent is a base component for components with views. It extends PrimedComponent.
 * In addition to the root and task manager, the SyncedComponent also provides a syncedStateConfig
 * and assures that the syncedState will be initialized according the config by the time the view
 * is rendered.
 *
 * As this is used for views, it also implements the IComponentHTMLView interface, and requires
 * the render function to be filled in.
 *
 * Generics (extended from PrimedComponent):
 * P - represents a type that will define optional providers that will be injected
 * S - the initial state type that the produced component may take during creation
 * E - represents events that will be available in the EventForwarder
 */
export abstract class SyncedComponent<
    P extends IComponent = object,
    S = undefined,
    E extends IEvent = IEvent
> extends PrimedComponent<P, S, E> implements IComponentHTMLView {
    private readonly syncedStateConfig: SyncedStateConfig = new Map();
    private readonly fluidComponentMap: FluidComponentMap = new Map();
    private readonly syncedStateDirectoryId = "syncedState";
    private internalSyncedState: ISharedMap | undefined;

    public get IComponentHTMLView() {
        return this;
    }

    /**
     * Runs the first time the component is generated and sets up all necessary data structures for the view
     * To extend this function, please call super() prior to adding to functionality to ensure correct initializing
     */
    protected async componentInitializingFirstTime(props?: any): Promise<void> {
        // Initialize our synced state map for the first time using our
        // syncedStateConfig values
        await this.initializeStateFirstTime();
    }

    /**
     * Runs any time the component is rendered again. It sets up all necessary data structures for the view, along
     * with any additional ones that may have been added due to user behavior
     * To extend this function, please call super() prior to adding to functionality to ensure correct initializing
     */
    protected async componentInitializingFromExisting(): Promise<void> {
        // Load our existing state values to be ready for the render lifecycle
        await this.initializeStateFromExisting();
    }

    /**
     * Returns an interface to interact with the stored synced state for the component. Views can get and fetch values
     * from it based on their syncedStateId to retrieve their view-specific information. They can also attach listeners
     * using the addValueChangedListener
     */
    public get syncedState(): ISyncedState {
        if (!this.internalSyncedState) {
            throw new Error(this.getUninitializedErrorString(`syncedState`));
        }
        return {
            set: this.internalSyncedState.set.bind(this.internalSyncedState),
            get: this.internalSyncedState.get.bind(this.internalSyncedState),
            addValueChangedListener: (callback) => {
                if (!this.internalSyncedState) {
                    throw new Error(
                        this.getUninitializedErrorString(`syncedState`),
                    );
                }
                this.internalSyncedState.on("valueChanged", callback);
            },
        };
    }

    /**
     * Returns the data props used by the view to manage the different DDS' and add any new ones
     */
    public get dataProps() {
        return {
            runtime: this.runtime,
            fluidComponentMap: this.fluidComponentMap,
        };
    }

    /**
     * Set values to the syncedStateConfig where the view and fluid states have the same values defined by S.
     * Each view with a unique syncedStateId needs its own value in the syncedStateConfig.
     * @param key - The syncedStateId that maps to the view that will be using these definitions
     * @param value - The config value containing the syncedStateId and the fluidToView and viewToFluid maps
     */
    public setConfig<S>(key: string, value: ISyncedStateConfig<S, S>) {
        this.syncedStateConfig.set(key, value);
    }

    /**
     * Set values to the syncedStateConfig with different view and fluid state definitions.
     * Each view with a unique syncedStateId needs its own value in the syncedStateConfig,
     * with SV being the view state definition and SF being the fluid state definition.
     * @param key - The syncedStateId that maps to the view that will be using these definitions
     * @param value - The config value containing the syncedStateId and the fluidToView and viewToFluid maps
     * that establish the relationship between SV and SF
     */
    public setFluidConfig<
        SV extends IFluidFunctionalComponentViewState,
        SF extends IFluidFunctionalComponentFluidState
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

    /**
     * Returns a view. This function need to be implemented for any consumer of SyncedComponent
     * to render values that have been initialized using the syncedStateConfig
     * @param element - The document that the rendered value will be displayed in
     */
    public render(element: HTMLElement) {
        throw Error("Render function was not implemented");
    }

    private async initializeStateFirstTime() {
        this.internalSyncedState = SharedMap.create(
            this.runtime,
            this.syncedStateDirectoryId,
        );
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
            for (const [key, value] of fluidToView.entries()) {
                const fluidKey = key as string;
                const rootKey = value.rootKey;
                const createCallback = value.sharedObjectCreate;
                if (createCallback) {
                    const sharedObject = createCallback(this.runtime);
                    this.fluidComponentMap.set(sharedObject.handle.path, {
                        component: sharedObject,
                        listenedEvents: value.listenedEvents || ["valueChanged"],
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
        this.internalSyncedState = (await this.runtime.getChannel(
            this.syncedStateDirectoryId,
        )) as ISharedMap;
        // Reload the stored state for each config provided
        for (const stateConfig of this.syncedStateConfig.values()) {
            const { syncedStateId, fluidToView } = stateConfig;
            // Fetch this specific view's state using the syncedStateId
            const storedFluidStateHandle = this.syncedState.get<
                IComponentHandle<ISharedMap>
            >(`syncedState-${syncedStateId}`);
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
            for (const [key, value] of fluidToView.entries()) {
                const fluidKey = key as string;
                const rootKey = value.rootKey;
                const createCallback = value.sharedObjectCreate;
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
                        listenedEvents: value.listenedEvents || ["valueChanged"],
                    });
                } else {
                    const storedValue = rootKey
                        ? this.root.get(rootKey)
                        : storedFluidState.get(fluidKey);
                    const handle = storedValue?.IComponentHandle;
                    if (handle) {
                        this.fluidComponentMap.set(handle.path, {
                            component: await handle.get(),
                            listenedEvents: value.listenedEvents || [
                                "valueChanged",
                            ],
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
