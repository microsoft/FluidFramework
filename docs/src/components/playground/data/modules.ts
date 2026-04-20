/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { diceRollerTutorial } from "./diceRollerTutorial";
import { sharedTreeTutorial } from "./sharedTreeTutorial";
import type { TutorialModule } from "./types";

/**
 * Registry of all tutorial modules, keyed by module id.
 */
export const modulesById: Record<string, TutorialModule> = {
	"dice-roller": diceRollerTutorial,
	"shared-tree-todo": sharedTreeTutorial,
};

/**
 * Ordered list of all tutorial modules for display in the module selector.
 */
export const moduleList: TutorialModule[] = Object.values(modulesById);
