import { Layout } from "react-grid-layout";
import { ComponentStorage } from "@fluid-example/component-storage";
import { IComponentLoadable, IComponent } from "@microsoft/fluid-component-core-interfaces";

export async function createAndStoreComponent(type: string, layout: Layout, storage?: ComponentStorage):
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
