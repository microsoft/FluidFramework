/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "fluid-framework";

const schemaFactory = new SchemaFactory("fluid-example-external-controller");

/**
 * Represents a die with a value between 1 and 6.
 */
export class Dice extends schemaFactory.object("Dice", {
	/**
	 * The value of the die
	 * @remarks Should be on [1, 6].
	 */
	value: schemaFactory.number,
}) {}

/**
 * Represents the application state containing two dice.
 */
export class TwoDiceApp extends schemaFactory.object("AppSchema", {
	/**
	 * The first die in the app.
	 */
	dice1: Dice,
	/**
	 * The second die in the app.
	 */
	dice2: Dice,
}) {}
