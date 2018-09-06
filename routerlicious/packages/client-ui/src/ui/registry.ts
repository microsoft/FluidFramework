import * as MergeTree from "@prague/merge-tree";
import ReferenceType = MergeTree.ReferenceType;

import { Box, Formula, Sheetlet, Slider } from ".";

// TODO: Component registry should not be static/global.
export const refTypeNameToComponent = new Map<string, Box<any>>([
    ["formula", new Formula()],
    ["sheetlet", new Sheetlet()],
    ["slider", new Slider()],
]);

/**
 * Returns the component singleton if 'marker' is a reference to a register component,
 * else returns 'undefined'.
 */
export function maybeGetComponent(marker: MergeTree.Marker) {
    if (marker.refType === ReferenceType.Simple) {
        const typeName = marker.properties.ref && marker.properties.ref.type.name;
        return refTypeNameToComponent.get(typeName);
    } else {
        return undefined;
    }
}
