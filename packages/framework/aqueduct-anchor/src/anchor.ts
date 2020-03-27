/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { SummarizableData, SummarizableObject } from "@microsoft/fluid-summarizable-object";
import { ISequencedDocumentMessage, IUser, MessageType } from "@microsoft/fluid-protocol-definitions";
import {
    IComponentContext,
    IComponentRuntime,
    IEnvelope,
} from "@microsoft/fluid-runtime-definitions";
import { IAqueductAnchor } from "./interfaces";

/**
 * This interface describes the format of the data that we store in the SummarizableObject.
 */
interface IAnchorData {
    timestamp: number,
    user: IUser,
}

/**
 * This component keeps track of container level information. It should be loaded when the container is
 * loaded so that it can correctly track such information. For example, it tracks the following:
 * - The last user who edited this container.
 * - The timestamp of the last time the container was edited.
 *
 * It listens to all the ops in the container and updates the tracking information. It uses a SummarizableObject
 * to store this data because it wants the data to be part of the summary but it should not generate addition ops
 * in the op listener.
 */
export class AqueductAnchor extends PrimedComponent implements IAqueductAnchor {
    public static getFactory() { return AqueductAnchor.factory; }

    public name: string = "default";
    private static readonly factory = new PrimedComponentFactory(
        AqueductAnchor, [
            SummarizableObject.getFactory(),
        ],
    );

    private _summarizableObject!: SummarizableObject;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    /**
     * Returns the id of the last user that edited this document.
     */
    public getLastEditedUserId(): string | undefined {
        const lastEdited: IAnchorData = this._summarizableObject.get() as unknown as IAnchorData;
        return lastEdited?.user?.id;
    }

    /**
     * Returns the timestamp of the last edit to this document.
     */
    public getLastEditedTimeStamp(): number | undefined {
        const lastEdited: IAnchorData = this._summarizableObject.get() as unknown as IAnchorData;
        return lastEdited?.timestamp;
    }

    protected async componentInitializingFirstTime() {
        const object = SummarizableObject.create(this.runtime);
        this.root.set("summarizable-object", object.handle);
    }

    protected async componentHasInitialized() {
        this._summarizableObject =
            await this.root.get<IComponentHandle<SummarizableObject>>("summarizable-object").get();

        this.context.hostRuntime.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === MessageType.Operation) {
                const envelope = message.contents as IEnvelope;
                // Filter out scheduler ops.
                if (!envelope.address.includes("_scheduler")) {
                    // Get the user information from the client information in the quorum.
                    const client = this.context.getQuorum().getMember(message.clientId);
                    const user = client?.client.user as IUser;
                    const lastEdited: IAnchorData = {
                        timestamp: message.timestamp,
                        user,
                    };
                    this._summarizableObject.set(lastEdited as unknown as SummarizableData);
                }
            }
        });
    }
}
