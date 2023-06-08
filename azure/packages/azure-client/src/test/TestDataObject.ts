/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory, IDataObjectProps } from "@fluidframework/aqueduct";

/**
 * DataObject used for testing.
 */
export class TestDataObject extends DataObject {
	public static get Name(): string {
		return "@fluid-example/test-data-object";
	}

	public static readonly factory = new DataObjectFactory(
		TestDataObject.Name,
		TestDataObject,
		[],
		{},
	);

	/**
	 * Creates a new TestDataObject.
	 *
	 * @param props - props for the object
	 */
	public constructor(props: IDataObjectProps) {
		super(props);
	}
}
