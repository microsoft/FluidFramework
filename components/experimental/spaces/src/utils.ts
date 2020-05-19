import { Layout } from "react-grid-layout";
import {
    FluidReducerProps,
    useReducerFluid,
} from "@microsoft/fluid-aqueduct-react";

import { IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISpacesStoredComponent,
    ISpacesProps,
    ISpacesViewState,
    ISpacesReducer,
    ISpacesDataProps,
    ISpacesSelector,
    ComponentMapKey,
} from "./interfaces";
import { SpacesStorage } from "./storage";
import { SpacesReducer } from "./reducers";
import { SpacesSelector } from "./selectors";

export async function createAndStoreComponent(type: string, layout: Layout, storage?: SpacesStorage):
Promise<IComponent & IComponentLoadable | undefined> {
    if (storage === undefined) {
        throw new Error("Can't add item, storage not found");
    }

    return storage.createAndAttachComponent(type).then((component) => {
        if (component.handle === undefined) {
            throw new Error("Can't add, component must have a handle");
        }

        storage.addItem(
            component.handle,
            type,
            layout,
        );

        return component;
    });
}

export async function setTemplate(storage?: SpacesStorage) {
    const templateString = localStorage.getItem("spacesTemplate");
    if (templateString) {
        const templateItems = JSON.parse(templateString) as ISpacesStoredComponent[];
        const promises = templateItems.map(async (templateItem) => {
            return createAndStoreComponent(templateItem.type, templateItem.layout, storage);
        });
        await Promise.all(promises);
    }
}

export function useReducer(props: ISpacesProps) {
    const { localComponentMap, fluidComponentMap, root, runtime, componentRegistry, syncedStorage } = props;
    const stateToRootMap = new Map<keyof ISpacesViewState, string>();
    stateToRootMap.set("componentMap", ComponentMapKey);
    const reducerProps: FluidReducerProps<ISpacesViewState, ISpacesReducer, ISpacesSelector, ISpacesDataProps> = {
        root,
        runtime,
        fluidComponentMap,
        initialState: { componentMap: localComponentMap },
        reducer: SpacesReducer,
        selector: SpacesSelector,
        stateToRoot: stateToRootMap,
        rootToState: (syncedState: ISpacesViewState) => {
            syncedState.componentMap = root.get("componentMap");
            return syncedState;
        },
        dataProps: {
            runtime,
            fluidComponentMap,
            componentRegistry,
            syncedStorage,
        },
    };
    return useReducerFluid<ISpacesViewState, ISpacesReducer, ISpacesSelector, ISpacesDataProps>(reducerProps);
}
