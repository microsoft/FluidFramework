/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";

export class TestDataObject extends DataObject {
    public static get Name() { return "@fluid-example/test-data-object"; }

    public static readonly factory = new DataObjectFactory<TestDataObject, undefined, undefined, IEvent>
    (
        TestDataObject.Name,
        TestDataObject,
        [],
        {},
    );

    public constructor(props: IDataObjectProps) {
        super(props);
    }
}
