/* eslint-disable jsdoc/require-jsdoc */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";
import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

const factory = new SchemaFactoryAlpha("cross-package-example");

export class Position extends factory.objectAlpha("Position", {
	x: SchemaFactory.number,
	y: SchemaFactory.number,
}) {}

export class Dimensions extends factory.objectAlpha("Dimensions", {
	width: SchemaFactory.number,
	height: SchemaFactory.number,
}) {}

export class Container extends factory.objectAlpha("Container", {
	id: SchemaFactory.string,
	position: Position,
	dimensions: SchemaFactory.optional(Dimensions),
}) {}

export class AppState extends factory.objectAlpha("AppState", {
	containers: factory.mapAlpha("ContainerMap", Container),
	labels: factory.mapAlpha("LabelMap", SchemaFactory.string),
}) {}
