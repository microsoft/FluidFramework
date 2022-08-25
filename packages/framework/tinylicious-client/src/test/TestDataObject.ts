/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";

export class TestDataObject extends DataObject {
    public static get Name() { return "@fluid-example/test-data-object"; }

    public static readonly factory = new DataObjectFactory(
        TestDataObject.Name,
        TestDataObject,
        [],
        {},
    );

    public constructor(props: IDataObjectProps) {
        super(props);
    }
}
