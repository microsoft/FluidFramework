import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    ISpacesSelector, ISpacesViewComponent,
} from "@fluid-example/spaces-definitions";

export const SpacesSelector: ISpacesSelector = {
    areTemplatesAvailable: {
        function: (
            state,
        ) => { return { result: state.dataProps.componentRegistry?.IComponentRegistryTemplates !== undefined }; },
    },
    componentMap: {
        function: (
            state,
        ) => {
            const storedComponents = state.dataProps.syncedStorage?.componentList;
            const componentMap: Map<string, ISpacesViewComponent> = new Map();
            const newComponentHandles: IComponentHandle[] = [];
            if (storedComponents) {
                storedComponents.forEach((value, key) => {
                    const mapValue = state.dataProps.fluidComponentMap.get(value.handle.path);
                    const component = mapValue?.component;
                    if (component) {
                        componentMap.set(key, {
                            component,
                            layout: value.layout,
                            type: value.type,
                        });
                    } else if (mapValue === undefined) {
                        newComponentHandles.push(value.handle);
                    }
                });
            }
            return { result: componentMap, newComponentHandles };
        },
    },
};
