/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { execSync } from "child_process";
import { Flags } from '@oclif/core'
import { BaseCommand } from "../../base";

export default class BundleAnalysesRun extends BaseCommand {
  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with a value (-n, --name=VALUE)
    name: Flags.string({char: 'n', description: 'name to print'}),
    // flag with no value (-f, --force)
    force: Flags.boolean({char: 'f'}),
    ...super.flags,
  }

  static args = [{name: 'file'}]

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(BundleAnalysesRun)

    try {
        execSync(`npx danger ci -d ${__dirname}/dangerfile.js`, { stdio: "inherit" });
    } catch (error_: unknown) {
        this.error(error_ as string);
        // process.exit(-1);
    }
  }
}
