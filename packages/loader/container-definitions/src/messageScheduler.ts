/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage, IDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaManager } from "./deltas";

export interface IMessageScheduler extends IProvideMessageScheduler {
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
}

export const IMessageScheduler: keyof IProvideMessageScheduler = "IMessageScheduler";

export interface IProvideMessageScheduler {
    readonly IMessageScheduler: IMessageScheduler;
}
