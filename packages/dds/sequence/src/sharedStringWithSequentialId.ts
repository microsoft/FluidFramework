/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMergeTreeOp, Marker,
    MergeTreeDeltaType, reservedMarkerIdKey } from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { parseHandles } from "@fluidframework/shared-object-base";
import { createIdAfterMin, createIdBeforeMax } from "./generateSequentialId";
import { SharedString } from "./sharedString";

export function sharedStringWithSequentialIdMixin(Base: typeof SharedString = SharedString): typeof SharedString {
    return class SequenceWithSequentialId extends Base {
        protected processMergeTreeMsg(
            rawMessage: ISequencedDocumentMessage): void {
                const message = parseHandles(
                    rawMessage,
                    this.runtime.IFluidSerializer);
                this.applySequentialId(message);
                super.processMergeTreeMsg(rawMessage);
        }

        private applySequentialId(msg: ISequencedDocumentMessage) {
            if (msg.type !== MessageType.Operation) {
                return;
            }

            const op = msg.contents as IMergeTreeOp;
            if (op.type === MergeTreeDeltaType.INSERT && op.seg !== undefined
                && typeof op.seg === "object") {
                // this is a marker
                if (op.pos1 === undefined) {
                    return;
                }

                const insertSegment = this.client.getContainingSegment(op.pos1);
                if (!Marker.is(insertSegment.segment)) {
                    return;
                }
                const newMarker = insertSegment.segment;
                let newMarkerProps = newMarker.properties ?? {};
                const newMarkerCp = this.getPosition(newMarker);
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
                newMarker.properties = newMarkerProps;
            }
        }
    };
}
