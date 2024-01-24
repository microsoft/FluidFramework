/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory, type IDataObjectProps } from "@fluidframework/aqueduct";

/**
 * Mock {@link @fluidframework/aqueduct#DataObject} for use in tests.
 */
export class TestDataObject extends DataObject {
	public static readonly Name = "@fluid-example/test-data-object";

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
