import { Layout } from "react-grid-layout";
import { IComponentRegistry } from "@microsoft/fluid-runtime-definitions";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { IComponentHandle, IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidDataProps,
    FluidSelectorFunction,
    IFluidFunctionalComponentViewState,
    FluidEffectFunction,
    FluidStateUpdateFunction,
    FluidAsyncStateUpdateFunction,
    FluidComponentMap,
    IFluidFunctionalComponentFluidState,
    IFluidReducer,
    IFluidSelector,
    ICombinedState,
} from "@microsoft/fluid-aqueduct-react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { SpacesStorage } from "../storage";
import { IInternalRegistryEntry } from "./componentInternalRegistry";

export const SpacesStorageKey = "spaces-storage";
export const ComponentMapKey = "component-map";

export interface ISpacesDataProps extends IFluidDataProps {
    syncedStorage: SpacesStorage,
    componentRegistry?: IComponent,
}

export interface ISpacesViewContext {
    supportedComponents?: IInternalRegistryEntry[],
    reducer?: ISpacesReducer,
    selector?: ISpacesSelector,
    state?: ICombinedState<IFluidFunctionalComponentViewState,IFluidFunctionalComponentFluidState,ISpacesDataProps>,
}

/**
 * Spaces collects loadable components paired with a type.  The type is actually not generally needed except for
 * supporting export to template.
 */
export interface ISpacesFluidComponent {
    handle: IComponentHandle,
    type: string,
    layout: Layout,
}

export interface ISpacesViewComponent {
    component: IComponent,
    type: string,
    layout: Layout,
}

export interface ISpacesProps {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    initialViewState: IFluidFunctionalComponentViewState,
    initialFluidState: IFluidFunctionalComponentFluidState,
    fluidComponentMap: FluidComponentMap,
    supportedComponents: IInternalRegistryEntry[],
    syncedStorage: SpacesStorage,
    componentRegistry?: IComponentRegistry,
}

export interface ISpacesReducer extends IFluidReducer<
IFluidFunctionalComponentViewState,
IFluidFunctionalComponentFluidState,
ISpacesDataProps
> {
    applyTemplate: FluidAsyncStateUpdateFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
    saveLayout: FluidEffectFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
    addComponent: FluidAsyncStateUpdateFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
    updateLayout: FluidStateUpdateFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
    removeComponent: FluidStateUpdateFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
}

export interface ISpacesSelector extends IFluidSelector<
IFluidFunctionalComponentViewState,
IFluidFunctionalComponentFluidState,
ISpacesDataProps
> {
    areTemplatesAvailable: FluidSelectorFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
    componentMap: FluidSelectorFunction<IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISpacesDataProps>,
}
