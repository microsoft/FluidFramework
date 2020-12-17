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
                super.processMergeTreeMsg(rawMessage);
                const message = parseHandles(
                    rawMessage,
                    this.runtime.IFluidSerializer);
                this.applySequentialId(message);
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
                let previousMarker: Marker | undefined;
                let nextMarker: Marker | undefined;
                this.walkSegments((segment) => {
                    if (segment.type === Marker.type) {
                        previousMarker = segment as Marker;
                    }
                    return true;
                }, 0, newMarkerCp - 1);

                this.walkSegments((segment) => {
                    if (segment.type === Marker.type) {
                        nextMarker = segment as Marker;
                    }
                    return true;
                }, newMarkerCp + 1, this.getLength());

                const previousMarkerId = previousMarker ? previousMarker.getId() : "";
                const nextMarkerId =  nextMarker ? nextMarker.getId() : "";

                // Generate sequentialId
                const previousMarkerCp = previousMarker ? this.getPosition(previousMarker) : 0;
                const nextMarkerCp = nextMarker ? this.getPosition(nextMarker) : this.getLength();
                const distancePreviousMarker = Math.abs(newMarkerCp - previousMarkerCp);
                const distanceToNextMarker = Math.abs(newMarkerCp - nextMarkerCp);
                const id = distancePreviousMarker < distanceToNextMarker ?
                createIdAfterMin(previousMarkerId, nextMarkerId)
                : createIdBeforeMax(previousMarkerId, nextMarkerId);
                newMarkerProps = { ...newMarkerProps, [reservedMarkerIdKey]: id };
                newMarker.properties = newMarkerProps;
            }
        }
    };
}
