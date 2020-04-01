/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { SummarizableObject } from "@microsoft/fluid-summarizable-object";
import { ISequencedDocumentMessage, IUser, MessageType } from "@microsoft/fluid-protocol-definitions";
import {
    IComponentContext,
    IComponentRuntime,
    IEnvelope,
    Jsonable,
} from "@microsoft/fluid-runtime-definitions";
import { IAqueductAnchor, ILastEditDetails } from "./interfaces";

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

    public get IAqueductAnchor() {
        return this;
    }

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
     * Returns the details of the last edit to the container.
     */
    public getLastEditDetails(): ILastEditDetails | undefined {
        const lastEditDetails = this._summarizableObject.get("lastEditDetails");
        return lastEditDetails !== undefined ? lastEditDetails as unknown as ILastEditDetails : undefined;
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
                    if (user !== undefined) {
                        const lastEditDetails: ILastEditDetails = {
                            user,
                            timestamp: message.timestamp,
                        };
                        this._summarizableObject.set("lastEditDetails", lastEditDetails as unknown as Jsonable);
                    }
                }
            }
        });
    }
}
