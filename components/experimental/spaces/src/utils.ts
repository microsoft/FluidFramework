import { Layout } from "react-grid-layout";
import {
    useReducerFluid,
    FluidToViewMap,
    ViewToFluidMap,
} from "@microsoft/fluid-aqueduct-react";

import { IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISpacesProps,
    ISpacesViewState,
    ISpacesFluidState,
    ISpacesFluidComponent,
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
        const templateItems = JSON.parse(templateString) as ISpacesFluidComponent[];
        const promises = templateItems.map(async (templateItem) => {
            return createAndStoreComponent(templateItem.type, templateItem.layout, storage);
        });
        await Promise.all(promises);
    }
}

export function useReducer(props: ISpacesProps) {
    const {
        initialFluidState,
        initialViewState,
        fluidComponentMap,
        root,
        runtime,
        componentRegistry,
        syncedStorage,
    } = props;
    const fluidToView: FluidToViewMap<ISpacesViewState, ISpacesFluidState> = new Map();
    const viewToFluid: ViewToFluidMap<ISpacesViewState, ISpacesFluidState> = new Map();
    const reducerProps = {
        syncedStateId: "spaces-reducer",
        root,
        initialViewState,
        initialFluidState,
        reducer: SpacesReducer,
        selector: SpacesSelector,
        fluidToView,
        viewToFluid,
        dataProps: {
            runtime,
            fluidComponentMap,
            componentRegistry: componentRegistry as IComponent,
            syncedStorage,
        },
    };
    return useReducerFluid(reducerProps);
}
