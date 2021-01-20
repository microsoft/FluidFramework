/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { Marker, MergeTreeDeltaType, MergeTreeMaintenanceType,
     reservedMarkerIdKey, SortedSegmentSet } from "@fluidframework/merge-tree";
import { createIdAfterMin } from "./generateSequentialId";
import { SequenceMaintenanceEvent } from "./sequenceDeltaEvent";
import { SharedString } from "./sharedString";

export function sharedStringWithSequentialIdMixin(Base: typeof SharedString = SharedString): typeof SharedString {
    return class SequenceWithSequentialId extends Base {
        private readonly sortedMarkers: SortedSegmentSet;
        constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
            super(document, id, attributes);
            this.sortedMarkers = new SortedSegmentSet();
            this.client.specToSegment
            this.on("maintenance", this.applySequentialId);
        }

        private readonly applySequentialId = (event: SequenceMaintenanceEvent): void => {
            if (event.deltaArgs.operation === MergeTreeMaintenanceType.ACKNOWLEDGED) {
                event.ranges.forEach((range) => {
                    const markerSegment = range.segment;
                    if (Marker.is(markerSegment)) {
                        if (event.opArgs.op.type === MergeTreeDeltaType.INSERT) {
                            this.sortedMarkers.addOrUpdate(markerSegment);
                            const markerItems = this.sortedMarkers.items;
                            const newMarkerIndex = markerItems.indexOf(markerSegment);
                            const previousMarkerIndex = newMarkerIndex - 1;
                            const nextMarkerIndex = newMarkerIndex + 1;
                            const previousMarker = previousMarkerIndex >= 0 ?
                             markerItems[previousMarkerIndex] as Marker : undefined;
                            const nextMarker = nextMarkerIndex < markerItems.length ?
                             markerItems[nextMarkerIndex] as Marker : undefined;
                            const previousId = previousMarker !== undefined ? previousMarker.getId() : "";
                            const nextId = nextMarker !== undefined ? nextMarker.getId() : "";
                            // Generate sequentialId

                            let newMarkerProps = markerSegment.properties ?? {};
                            const id = createIdAfterMin(previousId, nextId);
                            newMarkerProps = { ...newMarkerProps, [reservedMarkerIdKey]: id };
                            markerSegment.properties = newMarkerProps;
                        } else if (event.opArgs.op.type === MergeTreeDeltaType.REMOVE) {
                            this.sortedMarkers.remove(markerSegment);
                        }
                    }
                });
            }
        };
    };
}
