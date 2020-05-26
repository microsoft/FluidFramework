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
} from "@microsoft/fluid-aqueduct-react";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { SpacesStorage } from "../storage";
import { IInternalRegistryEntry } from "./componentInternalRegistry";

export const SpacesStorageKey = "spaces-storage";
export const ComponentMapKey = "component-map";

export interface ISpacesDataProps extends IFluidDataProps {
    syncedStorage?: SpacesStorage,
    componentRegistry?: IComponent,
}

export interface ISpacesViewContext {
    supportedComponents?: IInternalRegistryEntry[],
    reducer?: ISpacesReducer,
    selector?: ISpacesSelector,
    state?: ISpacesViewState,
}

export interface ISpacesViewState extends IFluidFunctionalComponentViewState {
    componentHandleMap: Map<string, ISpacesViewComponent>,
}

export interface ISpacesFluidState extends IFluidFunctionalComponentFluidState {
    componentMap: Map<string, ISpacesFluidComponent>,
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
    initialViewState: ISpacesViewState,
    initialFluidState: ISpacesFluidState,
    fluidComponentMap: FluidComponentMap,
    supportedComponents: IInternalRegistryEntry[],
    syncedStorage: SpacesStorage,
    componentRegistry?: IComponentRegistry,
}

export interface ISpacesReducer {
    applyTemplate: FluidAsyncStateUpdateFunction<ISpacesViewState, ISpacesFluidState, ISpacesDataProps>,
    saveLayout: FluidEffectFunction<ISpacesViewState,  ISpacesFluidState, ISpacesDataProps>,
    addComponent: FluidAsyncStateUpdateFunction<ISpacesViewState, ISpacesFluidState,  ISpacesDataProps>,
    updateLayout: FluidStateUpdateFunction<ISpacesViewState,  ISpacesFluidState, ISpacesDataProps>,
    removeComponent: FluidStateUpdateFunction<ISpacesViewState, ISpacesFluidState,  ISpacesDataProps>,
}

export interface ISpacesSelector {
    areTemplatesAvailable: FluidSelectorFunction<ISpacesViewState, ISpacesDataProps>;
}
