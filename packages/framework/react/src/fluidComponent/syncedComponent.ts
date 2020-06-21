/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent } from "@fluidframework/aqueduct";
import { IComponent, IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IEvent } from "@fluidframework/common-definitions";
import {
    SharedDirectory,
    SharedMap,
    MapFactory,
    ISharedDirectory,
} from "@fluidframework/map";
import { ITaskManager } from "@fluidframework/runtime-definitions";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";

import {
    FluidToViewMap,
    ViewToFluidMap,
    FluidComponentMap,
} from "../interface";
import { generateComponentSchema, setComponentSchema, getComponentSchema } from "../helpers";
import { IComponentSynced } from "./componentSynced";

export interface ISyncedStateConfig<SV, SF> {
    syncedStateId: string;
    defaultViewState: SV;
    fluidToView: FluidToViewMap<SV, SF>;
    viewToFluid?: ViewToFluidMap<SV, SF>;
}

export type SyncedStateConfig = Map<string, ISyncedStateConfig<any, any>>;

export abstract class SyncedComponent<
    P extends IComponent = object,
    S = undefined,
    E extends IEvent = IEvent
    > extends PrimedComponent<P, S, E> implements IComponentSynced, IComponentHTMLView {
    public syncedStateConfig: SyncedStateConfig = new Map();
    protected fluidComponentMap: FluidComponentMap = new Map();
    protected internalSyncedState: SharedMap | undefined;
    public get IComponentSynced() { return this; }
    public get IComponentHTMLView() { return this; }

    protected async initializeInternal(props?: any): Promise<void> {
        // Initialize task manager.
        const request = {
            headers: [[true]],
            url: `/_scheduler`,
        };

        this.internalTaskManager = await this.asComponent<ITaskManager>(
            this.context.containerRuntime.request(request),
        );

        if (!this.runtime.existing) {
            // Create a root directory and register it before calling componentInitializingFirstTime
            this.internalRoot = SharedDirectory.create(
                this.runtime,
                this.rootDirectoryId,
            );
            this.internalRoot.register();
            // Initialize our synced state map for the first time using our
            // syncedStateConfig values
            await this.initializeStateFirstTime();
            await this.componentInitializingFirstTime(props);
        } else {
            // Component has a root directory so we just need to set it before calling componentInitializingFromExisting
            this.internalRoot = (await this.runtime.getChannel(
                this.rootDirectoryId,
            )) as ISharedDirectory;
            // Fetch our syncedState that contains all the individual React components states
            this.internalSyncedState = await this.root.get("syncedState").get();
            // This will actually be an ISharedMap if the channel was previously created by the older version of
            // PrimedComponent which used a SharedMap.  Since SharedMap and SharedDirectory are compatible unless
            // SharedDirectory-only commands are used on SharedMap, this will mostly just work for compatibility.
            if (this.root.attributes.type === MapFactory.Type) {
                this.runtime.logger.send({
                    category: "generic",
                    eventName: "MapPrimedComponent",
                    message:
                        "Legacy document, SharedMap is masquerading as SharedDirectory in PrimedComponent",
                });
            }
            // Load our existing state values to be ready for the render lifecycle
            await this.initializeStateFromExisting();
            await this.componentInitializingFromExisting();
        }

        // This always gets called at the end of initialize on FirstTime or from existing.
        await this.componentHasInitialized();
    }

    public get syncedState() {
        if (!this.internalSyncedState) {
            throw new Error(this.getUninitializedErrorString(`syncedState`));
        }
        return this.internalSyncedState;
    }

    public get dataProps() {
        return {
            runtime: this.runtime,
            fluidComponentMap: this.fluidComponentMap,
        };
    }

    public render(element: HTMLElement) {
        throw Error("Render function was not implemented");
    }

    private async initializeStateFirstTime() {
        this.internalSyncedState = SharedMap.create(this.runtime);
        this.root.set("syncedState", this.internalSyncedState.handle);
        for (const stateConfig of this.syncedStateConfig.values()) {
            const { syncedStateId, fluidToView, viewToFluid, defaultViewState } = stateConfig;
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
                fluidMatchingMapHandle:
                    componentSchema.fluidMatchingMap.handle as IComponentHandle<SharedMap>,
                viewMatchingMapHandle:
                    componentSchema.viewMatchingMap.handle as IComponentHandle<SharedMap>,
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
            setComponentSchema(
                syncedStateId,
                this.syncedState,
                componentSchemaHandles,
            );
        }
    }

    private async initializeStateFromExisting() {
        // Fetch our synced state handle which is guaranteed to have been created by now
        const internalSyncedStateHandle = this.root.get("syncedState");
        if (internalSyncedStateHandle === undefined) {
            throw new Error(this.getUninitializedErrorString(`syncedState`));
        }
        this.internalSyncedState = await internalSyncedStateHandle.get();
        // Reload the stored state for each config provided
        for (const stateConfig of this.syncedStateConfig.values()) {
            const { syncedStateId, fluidToView } = stateConfig;
            // Fetch this specific view's state using the syncedStateId
            const storedFluidStateHandle = this.syncedState.get(`syncedState-${syncedStateId}`);
            if (storedFluidStateHandle === undefined) {
                throw new Error(this.getUninitializedErrorString(`syncedState-${syncedStateId}`));
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
                    const handle = rootKey ? this.root.get(rootKey) : storedFluidState.get(fluidKey);
                    if (handle === undefined) {
                        throw new Error(`Failed to find ${fluidKey} in synced state`);
                    }
                    this.fluidComponentMap.set(handle.path, {
                        component: await handle.get(),
                        listenedEvents: fluidToView?.get(fluidKey)
                            ?.listenedEvents || ["valueChanged"],
                    });
                }
                else {
                    const storedValue = rootKey ? this.root.get(rootKey) : storedFluidState.get(fluidKey);
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
            const componentSchemaHandles = getComponentSchema(syncedStateId, this.syncedState);
            if (componentSchemaHandles === undefined) {
                throw new Error(this.getUninitializedErrorString(`componentSchema-${syncedStateId}`));
            }
            this.fluidComponentMap.set(componentSchemaHandles.fluidMatchingMapHandle.path, {
                component: await componentSchemaHandles.fluidMatchingMapHandle.get(),
                isRuntimeMap: true,
            });
            this.fluidComponentMap.set(componentSchemaHandles.viewMatchingMapHandle.path, {
                component: await componentSchemaHandles.viewMatchingMapHandle.get(),
                isRuntimeMap: true,
            });
        }
    }
}
