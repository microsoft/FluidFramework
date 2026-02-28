/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/require-jsdoc */

import { sf } from "./schemaUtils.viaWrapper.js";

export class Position extends sf.objectAlpha("Position", {
	x: sf.number,
	y: sf.number,
}) {}

export class Dimensions extends sf.objectAlpha("Dimensions", {
	width: sf.number,
	height: sf.number,
}) {}

export class Container extends sf.objectAlpha("Container", {
	id: sf.string,
	position: Position,
	dimensions: sf.optional(Dimensions),
}) {}

export class AppState extends sf.objectAlpha("AppState", {
	containers: sf.mapAlpha("ContainerMap", Container),
	labels: sf.mapAlpha("LabelMap", sf.string),
}) {}
