import { Command, Flags } from "@oclif/core";
import { BaseBumpCommand } from "../bump";

export default class Deps extends BaseBumpCommand {
    static description = "Bump the dependencies version of specified package or release group";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        ...super.flags,
    };

    // static args = [{ name: "file" }];

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(Deps);

        this.log(`hello from deps`);
        this.error(`Not yet implemented`, { exit: 100 });
    }
}
