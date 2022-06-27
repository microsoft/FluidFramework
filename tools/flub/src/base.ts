import { Command } from "@oclif/core";
import { packageFilterFlags, rootPathFlag } from "./flags";

export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
    };
}
