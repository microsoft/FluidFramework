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
    dispatch?: (type: keyof ISpacesReducer, ...args: any) => void,
    fetch?: (type: keyof ISpacesSelector) => (any | undefined),
    state?: ISpacesViewState,
}

export interface ISpacesViewState extends IFluidFunctionalComponentViewState {
    componentMap: Map<string, ISpacesStoredComponent>,
}

/**
 * Spaces collects loadable components paired with a type.  The type is actually not generally needed except for
 * supporting export to template.
 */
export interface ISpacesStoredComponent {
    handle: IComponentHandle;
    type: string;
    layout: Layout;
}

export interface ISpacesProps {
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    localComponentMap: Map<string, ISpacesStoredComponent>,
    fluidComponentMap: FluidComponentMap;
    supportedComponents: IInternalRegistryEntry[];
    syncedStorage: SpacesStorage;
    componentRegistry?: IComponentRegistry;
}

export interface ISpacesReducer {
    applyTemplate: FluidAsyncStateUpdateFunction<ISpacesViewState, ISpacesDataProps>,
    saveLayout: FluidEffectFunction<ISpacesViewState, ISpacesDataProps>,
    addComponent: FluidAsyncStateUpdateFunction<ISpacesViewState, ISpacesDataProps>,
    updateLayout: FluidStateUpdateFunction<ISpacesViewState, ISpacesDataProps>,
    removeComponent: FluidStateUpdateFunction<ISpacesViewState, ISpacesDataProps>,
}

export interface ISpacesSelector {
    areTemplatesAvailable: FluidSelectorFunction<ISpacesViewState, ISpacesDataProps, boolean>;
}
