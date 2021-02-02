/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, Lazy } from "@fluidframework/common-utils";
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { Marker, MergeTreeDeltaType, MergeTreeMaintenanceType,
     reservedMarkerIdKey, SortedSegmentSet } from "@fluidframework/merge-tree";
import { SharedString, SequenceDeltaEvent,
    SequenceMaintenanceEvent, SharedStringFactory } from "@fluidframework/sequence";
import { createIdBetween, digitLast, digitZero } from "./generateSequentialId";

const minId = digitZero;
const maxId = digitLast;

export function createStringWithSequentialIdFactory(factory: SharedStringFactory,
     Base: typeof SharedString = SharedString): typeof SharedString {
    return class SharedStringWithSequentialId extends Base {
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
            // Add listener to maintenance event to get notified of local ops that have been acked.
            this.on("maintenance", this.applyIdToLocalAckedSegment);
            // Add listener to sequenceDelta event to get notified of remote ops that have been acked.
            this.on("sequenceDelta", this.applyIdToRemoteAckedSegment);
        }

        public static getFactory() {
            return factory;
        }

        private readonly applyIdToRemoteAckedSegment = (event: SequenceDeltaEvent): void => {
            if (event.isLocal) {
                // Do not apply id for local changes
                // We will apply id for local changes that have been acked via the 'maintenance' event
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
                        if (event.opArgs?.op.type === MergeTreeDeltaType.INSERT) {
                            this.applyIdToMarker(markerSegment);
                        } else if (event.opArgs?.op.type === MergeTreeDeltaType.REMOVE) {
                            this.sortedMarkers.value.remove(markerSegment);
                        }
                    }
                });
            }
        };

        private assignId(marker: Marker | undefined, defaultIdValue: string): string {
            if (marker !== undefined) {
                // If the marker is defined, it should have an id assigned.
                assert(marker.getId() !== undefined, "The id of the marker should be defined");
                return marker.getId() as string;
            }

            // If the marker is undefined, we return a defaultValue as an id
            return defaultIdValue;
        }

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
            const previousId: string = this.assignId(previousMarker, minId);
            const nextId: string = this.assignId(nextMarker, maxId);
            const newMarkerProps = markerSegment.properties ?? {};
            const id = createIdBetween(previousId, nextId);
            newMarkerProps[reservedMarkerIdKey] = id;
            markerSegment.properties = newMarkerProps;
        };
    };
}
