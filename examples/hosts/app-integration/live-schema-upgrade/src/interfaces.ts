/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDiceRollerAppModel as IDiceRollerAppModel1 } from "./modelVersion1";
import { IDiceRollerAppModel as IDiceRollerAppModel2 } from "./modelVersion2";

export type ModelType = IDiceRollerAppModel1 | IDiceRollerAppModel2;

export interface IDiceRollerAppModel {
	model: ModelType;
}

export { IDiceRollerAppModel1, IDiceRollerAppModel2 };
