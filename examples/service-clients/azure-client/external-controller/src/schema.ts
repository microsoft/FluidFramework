/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "fluid-framework";

const schemaFactory = new SchemaFactory("fluid-example-external-controller");

export class Dice extends schemaFactory.object("Dice", {
	/**
	 * The value of the die, which should be an integer on [1, 6].
	 */
	value: schemaFactory.number,
}) {}
