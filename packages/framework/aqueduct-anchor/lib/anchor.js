/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SummarizableObject } from "@microsoft/fluid-summarizable-object";
export class AqueductAnchor extends PrimedComponent {
    constructor(runtime, context) {
        super(runtime, context);
        this.name = "default";
    }
    static getFactory() { return AqueductAnchor.factory; }
    get data() {
        return this._summarizableObject.data;
    }
    set(data, sequenceNumber) {
        this._summarizableObject.set(data, sequenceNumber);
    }
    async componentInitializingFirstTime() {
        const object = SummarizableObject.create(this.runtime, "anchor-summarizable");
        this.root.set("summarizable-object", object.handle);
    }
    async componentHasInitialized() {
        this._summarizableObject =
            await this.root.get("summarizable-object").get();
    }
}
AqueductAnchor.factory = new PrimedComponentFactory(AqueductAnchor, [
    SummarizableObject.getFactory(),
]);
//# sourceMappingURL=anchor.js.map