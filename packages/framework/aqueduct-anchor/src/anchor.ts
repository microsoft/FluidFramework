/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { SummarizableObject } from "@microsoft/fluid-summarizable-object";
import { ISequencedDocumentMessage, IUser } from "@microsoft/fluid-protocol-definitions";
import {
    IComponentContext,
    IComponentRuntime,
    Jsonable,
} from "@microsoft/fluid-runtime-definitions";
import { ILastEdited, ILastEditDetails } from "./interfaces";

/**
 * This component keeps track of container level information. It should be loaded when the container is
 * loaded so that it can correctly track such information. For example, it tracks the following:
 * - The last user who edited this container.
 * - The timestamp of the last time the container was edited.
 * It uses a SummarizableObject to store the last edited data because it wants the data to be part of
 * the summary but it should not generate addition ops in the op listener.
 */
export class AqueductAnchor extends PrimedComponent implements ILastEdited {
    private static readonly factory = new PrimedComponentFactory(
        AqueductAnchor, [
            SummarizableObject.getFactory(),
        ],
    );

    public static getFactory() { return AqueductAnchor.factory; }

    public get ILastEdited() {
        return this;
    }

    private _message!: ISequencedDocumentMessage;
    private _summarizableObject!: SummarizableObject;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    /**
     * {@inheritDoc ILastEdited.getLastEditDetails}
     */
    public getLastEditDetails(): ILastEditDetails | undefined {
        return this._summarizableObject.get<ILastEditDetails>("lastEditDetails");
    }

    public get message(): ISequencedDocumentMessage {
        assert(this._message !== undefined, "Message should not be retrieved before setting it first");
        return this._message;
    }

    public set message(message: ISequencedDocumentMessage) {
        this._message = message;

        // Get the user information from the client information in the quorum and set the
        // summarizable object.
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

    protected async componentInitializingFirstTime() {
        const object = SummarizableObject.create(this.runtime);
        this.root.set("summarizable-object", object.handle);
    }

    protected async componentHasInitialized() {
        this._summarizableObject =
            await this.root.get<IComponentHandle<SummarizableObject>>("summarizable-object").get();
    }
}
