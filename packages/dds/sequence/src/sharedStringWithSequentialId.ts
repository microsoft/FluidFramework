/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { Marker,
    MergeTreeDeltaType, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { createIdAfterMin, createIdBeforeMax } from "./generateSequentialId";
import { SequenceDeltaEvent } from "./sequenceDeltaEvent";
import { SharedString } from "./sharedString";

export function sharedStringWithSequentialIdMixin(Base: typeof SharedString = SharedString): typeof SharedString {
    return class SequenceWithSequentialId extends Base {
        constructor(document: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
            super(document, id, attributes);
            this.on("sequenceDelta", this.applySequentialId);
        }

        private applySequentialId(deltaEvent: SequenceDeltaEvent) {
            deltaEvent.ranges.forEach(range => {
                const segment = range.segment;
                if (deltaEvent.deltaOperation === MergeTreeDeltaType.INSERT && Marker.is(segment)) {
                    let newMarkerProps = segment.properties ?? {};
                    const newMarkerCp = this.getPosition(segment);
                    const beforeMarkers: Marker[] = [];
                    const afterMarkers: Marker[] = [];
    
                    this.walkSegments((segment) => {
                        if (Marker.is(segment)) {
                            beforeMarkers.push(segment);
                        }
                        return true;
                    }, 0, newMarkerCp);
    
                    this.walkSegments((segment) => {
                        if (Marker.is(segment)) {
                            afterMarkers.push(segment);
                        }
                        return true;
                    }, newMarkerCp + 1, this.getLength());
    
                    const previousMarker: Marker | undefined = beforeMarkers.pop();
                    const nextMarker: Marker | undefined = afterMarkers.shift();
                    const previousMarkerId = previousMarker ? previousMarker.getId() : "";
                    const nextMarkerId =  nextMarker ? nextMarker.getId() : "";
    
                    // Generate sequentialId
                    const previousMarkerCp = previousMarker ? this.getPosition(previousMarker) : 0;
                    const nextMarkerCp = nextMarker ? this.getPosition(nextMarker) : 0;
                    const distancePreviousMarker = Math.abs(newMarkerCp - previousMarkerCp);
                    const distanceToNextMarker = Math.abs(newMarkerCp - nextMarkerCp);
    
                    let id: string;
                    if ((previousMarkerId.length === 0 && nextMarkerId.length === 0) ||
                     (previousMarkerId.length > 0 && nextMarkerId.length === 0)) {
                        id = createIdAfterMin(previousMarkerId, nextMarkerId);
                    } else if (nextMarkerId.length > 0 && previousMarkerId.length === 0) {
                        id = createIdBeforeMax(previousMarkerId, nextMarkerId);
                    } else {
                        id = distancePreviousMarker <= distanceToNextMarker ?
                         createIdAfterMin(previousMarkerId, nextMarkerId) :
                          createIdBeforeMax(previousMarkerId, nextMarkerId);
                    }
    
                    newMarkerProps = { ...newMarkerProps, [reservedMarkerIdKey]: id };
                    segment.properties = newMarkerProps;
                }

            });
        }
    };
}
