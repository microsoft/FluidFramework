/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command } from "@oclif/core";
import { rootPathFlag } from "./flags";

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
    };
}
