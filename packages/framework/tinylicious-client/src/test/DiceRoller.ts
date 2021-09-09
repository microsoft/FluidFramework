/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";

export class DiceRoller extends DataObject {
    public static get Name() { return "@fluid-example/dice-roller"; }

    public static readonly factory = new DataObjectFactory<DiceRoller, undefined, undefined, IEvent>
    (
        DiceRoller.Name,
        DiceRoller,
        [],
        {},
    );

    public constructor(props: IDataObjectProps) {
        super(props);
    }
}
