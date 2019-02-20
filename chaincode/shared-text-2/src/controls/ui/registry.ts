import { Box, BoxState } from "@prague/app-ui";
import { Marker, ReferenceType } from "@prague/merge-tree";

import {
    Chart,
    Formula,
    InnerComponent,
    Sheetlet,
    Slider,
} from ".";

// TODO: Component registry should not be static/global.
export const refTypeNameToComponent = new Map<string, Box<BoxState>>([
    ["chart", new Chart()],
    ["formula", new Formula()],
    ["sheetlet", new Sheetlet()],
    ["slider", new Slider()],
    ["innerComponent", new InnerComponent()],
]);

/**
 * Returns the component singleton if 'marker' is a reference to a register component,
 * else returns 'undefined'.
 */
export function maybeGetComponent(marker: Marker) {
    if (marker.refType === ReferenceType.Simple) {
        const typeName = marker.properties.ref && marker.properties.ref.type.name;
        return refTypeNameToComponent.get(typeName);
    } else {
        return undefined;
    }
}
