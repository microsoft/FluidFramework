import { Layout } from "react-grid-layout";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";

export const ComponentMapKey = "component-map";

export interface IStoredComponent {
    handle: IComponentHandle,
    type: string,
    layout: Layout,
}
