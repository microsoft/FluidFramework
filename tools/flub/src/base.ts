/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command } from "@oclif/core";
import { packageFilterFlags, rootPathFlag } from "./flags";

export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
    };
}
