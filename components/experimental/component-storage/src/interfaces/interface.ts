import { Layout } from "react-grid-layout";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

export const ComponentMapKey = "component-map";

export interface IStoredComponent {
    handle: IComponentHandle,
    type: string,
    layout: Layout,
}
