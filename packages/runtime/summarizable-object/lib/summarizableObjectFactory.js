/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { pkgVersion } from "./packageVersion";
import { SummarizableObject } from "./summarizableObject";
/**
 * The factory that defines the summarizable object.
 * @sealed
 */
export class SummarizableObjectFactory {
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    get type() {
        return SummarizableObjectFactory.Type;
    }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    get attributes() {
        return SummarizableObjectFactory.Attributes;
    }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.load}
     */
    async load(runtime, id, services, branchId, attributes) {
        const summarizableObject = new SummarizableObject(id, runtime, attributes);
        await summarizableObject.load(branchId, services);
        return summarizableObject;
    }
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.create}
     */
    create(runtime, id) {
        const summarizableObject = new SummarizableObject(id, runtime, SummarizableObjectFactory.Attributes);
        summarizableObject.initializeLocal();
        return summarizableObject;
    }
}
/**
 * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
 */
SummarizableObjectFactory.Type = "https://graph.microsoft.com/types/summarizable-object";
/**
 * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
 */
SummarizableObjectFactory.Attributes = {
    type: SummarizableObjectFactory.Type,
    snapshotFormatVersion: "0.1",
    packageVersion: pkgVersion,
};
//# sourceMappingURL=summarizableObjectFactory.js.map