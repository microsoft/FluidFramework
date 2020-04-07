/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { ISharedObjectEvents, ISharedObject } from "@microsoft/fluid-shared-object-base";
import { SequenceDeltaEvent } from "./sequenceDeltaEvent";


export interface ISharedSegmentSequenceEvents<TTarget extends ISharedObject =ISharedObject>
    extends ISharedObjectEvents {

    (event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: TTarget) => void);
    (
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: TTarget) => void);
}
