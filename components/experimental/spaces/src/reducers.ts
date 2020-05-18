import { Layout } from "react-grid-layout";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISpacesDataProps, Templates, ISpacesReducer } from "./interfaces";
import { createAndStoreComponent } from "./utils";

export const SpacesReducer: ISpacesReducer = {
    applyTemplate: {
        function: async (state, dataProps: ISpacesDataProps, template: Templates) => {
            if (dataProps.componentRegistry?.IComponentRegistryTemplates !== undefined
                && dataProps.syncedStorage !== undefined) {
                const newComponentHandles: IComponentHandle[] = [];
                const componentPromises: Promise<any>[] = [];
                // getFromTemplate filters down to just components that are present in this template
                const componentRegistryEntries = dataProps.componentRegistry.IComponentRegistryTemplates
                    .getFromTemplate(template);
                componentRegistryEntries.forEach((componentRegistryEntry) => {
                    // Each component may occur multiple times in the template, get all the layouts.
                    const templateLayouts: Layout[] = componentRegistryEntry.templates[template];
                    templateLayouts.forEach((layout: Layout) => {
                        componentPromises.push(
                            createAndStoreComponent(componentRegistryEntry.type, layout, dataProps.syncedStorage)
                                .then(((component) => {
                                    if (component?.handle !== undefined) {
                                        newComponentHandles.push(component?.handle);
                                    }
                                })),
                        );
                    });
                });
                return Promise.all(componentPromises).then(() => {
                    return { state, newComponentHandles };
                });
            } else {
                return { state };
            }
        },
    },
    saveLayout: {
        function: (state, dataProps: ISpacesDataProps) => {
            if (dataProps.syncedStorage === undefined) {
                throw new Error("Can't save layout, storage not found");
            }
            localStorage.setItem(
                "spacesTemplate",
                JSON.stringify([...dataProps.syncedStorage.componentList.values()]),
            );
        },
    },
    addComponent: {
        function: async (state, dataProps: ISpacesDataProps, type: string, layout: Layout) => createAndStoreComponent(
            type,
            { w: 20, h: 5, x: 0, y: 0 },
            dataProps.syncedStorage,
        ).then((component) => {
            if (component !== undefined && component.handle !== undefined) {
                state.componentMap.set(component.url, {
                    handle: component.handle,
                    type,
                    layout: { w: 20, h: 5, x: 0, y: 0 },
                });
                return { state, newComponentHandles: [component.handle] };
            }
            return { state };
        },
        ),
    },
    updateLayout: {
        function: (
            state,
            dataProps: ISpacesDataProps,
            key: string,
            newLayout: Layout,
        ) => {
            dataProps.syncedStorage?.updateLayout(key, newLayout);
            return { state };
        },
    },
    removeComponent: {
        function: (
            state,
            dataProps: ISpacesDataProps,
            url: string,
        ) => {
            dataProps.syncedStorage?.removeItem(url);
            return { state };
        },
    },
};
