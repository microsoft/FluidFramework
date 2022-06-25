import { Command } from "@oclif/core";
import { rootPathFlag } from "./flags";

export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
    };
}
