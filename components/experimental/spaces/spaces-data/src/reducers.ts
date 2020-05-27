import { Layout } from "react-grid-layout";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { Templates, ISpacesReducer } from "@fluid-example/spaces-definitions";
import { createAndStoreComponent } from "./utils";

export const SpacesReducer: ISpacesReducer = {
    applyTemplate: {
        asyncFunction: async (state, template: Templates) => {
            const { dataProps } = state;
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
        function: (state) => {
            const { dataProps } = state;
            if (dataProps.syncedStorage === undefined) {
                throw new Error("Can't save layout, storage not found");
            }
            localStorage.setItem(
                "spacesTemplate",
                JSON.stringify([...dataProps.syncedStorage.componentList.values()]),
            );
            return { state };
        },
    },
    addComponent: {
        asyncFunction: async (state, type: string, layout: Layout) => createAndStoreComponent(
            type,
            { w: 20, h: 5, x: 0, y: 0 },
            state.dataProps.syncedStorage,
        ).then((component) => {
            if (component !== undefined && component.handle !== undefined) {
                return { state, newComponentHandles: [component.handle] };
            }
            return { state };
        }),
    },
    updateLayout: {
        function: (
            state,
            key: string,
            newLayout: Layout,
        ) => {
            state.dataProps.syncedStorage?.updateLayout(key, newLayout);
            return { state };
        },
    },
    removeComponent: {
        function: (
            state,
            url: string,
        ) => {
            state.dataProps.syncedStorage?.removeItem(url);
            return { state };
        },
    },
};
