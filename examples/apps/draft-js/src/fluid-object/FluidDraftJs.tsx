/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMap, IValueChanged } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IQuorum } from "@fluidframework/protocol-definitions";
import { insertBlockStart } from "./RichTextAdapter";

interface IFluidDraftJsObject {
    text?: SharedString | undefined;
    authors?: SharedMap | undefined;
    quorum?: IQuorum;
    on(event: "addMember" | "removeMember", listener: () => void): this;
}

const addMemberValue = "addMember";
const removeMemberValue = "removeMember";

export class FluidDraftJsObject extends DataObject implements IFluidDraftJsObject {
    public static get Name() { return "@fluid-example/draft-js"; }

    public text: SharedString | undefined;
    public authors: SharedMap | undefined;

    public static readonly factory = new DataObjectFactory(
        FluidDraftJsObject.Name,
        FluidDraftJsObject,
        [SharedMap.getFactory(), SharedString.getFactory()],
        {},
    );

    /**
     * Do setup work here
     */
    protected async initializingFirstTime() {
        const text = SharedString.create(this.runtime);
        insertBlockStart(text, 0);
        text.insertText(text.getLength(), "starting text");
        this.root.set("text", text.handle);

        const authors = SharedMap.create(this.runtime);
        this.root.set("authors", authors.handle);
    }

    protected async hasInitialized() {
        [this.text, this.authors] = await Promise.all([this.root.get("text").get(), this.root.get("authors").get()]);

        // not used yet
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === addMemberValue) {
                this.emit(addMemberValue);
            }
            if (changed.key === removeMemberValue) {
                this.emit(removeMemberValue);
            }
        });
    }

    public quorum = this.runtime.getQuorum();

    public runtime = this.runtime;
}
