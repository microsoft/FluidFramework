/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Lazy } from "@fluidframework/common-utils";
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { Marker, MergeTreeDeltaType, MergeTreeMaintenanceType,
     reservedMarkerIdKey, SortedSegmentSet } from "@fluidframework/merge-tree";
import { createIdAfterMin, digitLast, digitZero } from "./generateSequentialId";
import { SequenceDeltaEvent, SequenceMaintenanceEvent } from "./sequenceDeltaEvent";
import { SharedString } from "./sharedString";

export function sharedStringWithSequentialIdMixin(Base: typeof SharedString = SharedString): typeof SharedString {
    return class SequenceWithSequentialId extends Base {
        private readonly sortedMarkers: Lazy<SortedSegmentSet>;
        constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
            super(document, id, attributes);
            this.sortedMarkers = new Lazy<SortedSegmentSet>(() => {
                const set = new SortedSegmentSet();
                this.walkSegments((segment) => {
                    if (Marker.is(segment) && segment.getId() !== undefined) {
                        // If it has an id then we have acked it
                        set.addOrUpdate(segment);
                    }
                    return true;
                });
                return set;
            });
            this.on("maintenance", this.applyIdToLocalAckedSegment);
            this.on("sequenceDelta", this.applyIdToRemoteAckedSegment);
        }

        private readonly applyIdToRemoteAckedSegment = (event: SequenceDeltaEvent): void => {
            if (event.isLocal) {
                // Do not apply id for local changes
                return;
            }

            event.ranges.forEach((range) => {
            const markerSegment = range.segment;
                if (Marker.is(markerSegment)) {
                    if (event.deltaOperation === MergeTreeDeltaType.INSERT) {
                        this.applyIdToMarker(markerSegment);
                    } else if (event.deltaOperation === MergeTreeDeltaType.REMOVE) {
                        this.sortedMarkers.value.remove(markerSegment);
                    }
                }
            });
        };

        private readonly applyIdToLocalAckedSegment = (event: SequenceMaintenanceEvent): void => {
            if (event.deltaArgs.operation === MergeTreeMaintenanceType.ACKNOWLEDGED) {
                event.ranges.forEach((range) => {
                    const markerSegment = range.segment;
                    if (Marker.is(markerSegment)) {
                        if (event.opArgs.op.type === MergeTreeDeltaType.INSERT) {
                            this.applyIdToMarker(markerSegment);
                        } else if (event.opArgs.op.type === MergeTreeDeltaType.REMOVE) {
                            this.sortedMarkers.value.remove(markerSegment);
                        }
                    }
                });
            }
        };

        private readonly applyIdToMarker = (markerSegment: Marker): void => {
            this.sortedMarkers.value.addOrUpdate(markerSegment);
            const markerItems = this.sortedMarkers.value.items;
            const newMarkerIndex = markerItems.indexOf(markerSegment);
            const previousMarkerIndex = newMarkerIndex - 1;
            const nextMarkerIndex = newMarkerIndex + 1;
            const previousMarker = previousMarkerIndex >= 0 ?
             markerItems[previousMarkerIndex] as Marker : undefined;
            const nextMarker = nextMarkerIndex < markerItems.length ?
             markerItems[nextMarkerIndex] as Marker : undefined;
            const previousId = previousMarker !== undefined ? previousMarker.getId() : digitZero;
            const nextId = nextMarker !== undefined ? nextMarker.getId() : digitLast;
            let newMarkerProps = markerSegment.properties ?? {};
            const id = createIdAfterMin(previousId, nextId);
            newMarkerProps = { ...newMarkerProps, [reservedMarkerIdKey]: id };
            markerSegment.properties = newMarkerProps;
        };
    };
}
