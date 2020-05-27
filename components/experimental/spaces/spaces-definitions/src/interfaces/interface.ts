import { Layout } from "react-grid-layout";
import { IComponentRegistry } from "@fluidframework/runtime-definitions";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { IComponentHandle, IComponent } from "@fluidframework/component-core-interfaces";
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
} from "@fluidframework/aqueduct-react";
import { ISharedDirectory } from "@fluidframework/map";
import { ComponentStorage } from "@fluid-example/component-storage";
import { IInternalRegistryEntry } from "./componentInternalRegistry";

export const SpacesStorageKey = "spaces-storage";

export interface ISpacesDataProps extends IFluidDataProps {
    syncedStorage: ComponentStorage,
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
    syncedStorage: ComponentStorage,
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
