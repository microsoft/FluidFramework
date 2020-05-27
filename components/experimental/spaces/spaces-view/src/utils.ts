import {
    useReducerFluid,
} from "@microsoft/fluid-aqueduct-react";
import { ComponentStorage } from "@fluid-example/component-storage";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    ISpacesProps,
    ISpacesFluidComponent,
    ISpacesDataProps,
} from "@fluid-example/spaces-definitions";
import { SpacesReducer, SpacesSelector, createAndStoreComponent } from "@fluid-example/spaces-data";

export async function setTemplate(storage?: ComponentStorage) {
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
    const dataProps: ISpacesDataProps = {
        runtime,
        fluidComponentMap,
        componentRegistry: componentRegistry as IComponent,
        syncedStorage,
    };
    const reducerProps = {
        syncedStateId: "spaces-reducer",
        root,
        initialViewState,
        initialFluidState,
        reducer: SpacesReducer,
        selector: SpacesSelector,
        fluidToView: new Map(),
        viewToFluid: new Map(),
        dataProps,
    };
    return useReducerFluid(reducerProps);
}
