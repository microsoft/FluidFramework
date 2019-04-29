import { Box, BoxState } from "@prague/app-ui";
import { Marker, ReferenceType } from "@prague/merge-tree";

import {
    Chart,
    Document,
    Formula,
    InnerComponent,
    Sheetlet,
    Slider,
} from ".";

// TODO: Component registry should not be static/global.
export const refTypeNameToComponent = new Map<string, Box<BoxState>>([
    ["chart", new Chart()],
    ["document", new Document()],
    ["formula", new Formula()],
    ["innerComponent", new InnerComponent()],
    ["sheetlet", new Sheetlet()],
    ["slider", new Slider()],
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
