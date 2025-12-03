/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRollerAppModel as IDiceRollerAppModel1 } from "./modelVersion1/index.js";
import { IDiceRollerAppModel as IDiceRollerAppModel2 } from "./modelVersion2/index.js";

/**
 * Interface to represent the two possible app models that can be loaded by the model loader.
 *
 * @remarks This is not necessary in a real-app scenario. It is only used since this example can use the same
 * model loader to load different versions of app, but this is unlikely in a production app.
 */
export interface IDiceRollerAppModel {
	readonly diceRoller: IDiceRollerAppModel1["diceRoller"] | IDiceRollerAppModel2["diceRoller"];
	readonly diceCounter?: IDiceRollerAppModel2["diceCounter"];
	readonly getCurrentVersion?: IDiceRollerAppModel2["getCurrentVersion"];
	readonly upgrade?: IDiceRollerAppModel2["upgrade"];
}
