/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from '@oclif/core'
import { generateMonoRepoInstallPackageJson, MonoRepoKind } from "@fluidframework/build-tools";
import { BaseCommand } from '../../base'

export class GeneratePackageJson extends BaseCommand {
  static description = 'describe the command here'

  static flags = {
    server: Flags.enum({
        description: "",
        options: [ MonoRepoKind.Server ],
        required: false,
     }),
    azure: Flags.enum({
        description: "",
        options: [ MonoRepoKind.Azure ],
        required: false,
     }),
    buildTools: Flags.enum({
        description: "",
        options: [ MonoRepoKind.BuildTools ],
        required: false,
     }),
     client: Flags.enum({
        description: "",
        options: [ MonoRepoKind.Client ],
        required: false,
     }),
    ...super.flags,
  }

  async run() {
    const { flags } = await this.parse(GeneratePackageJson);
    const timer = new Timer(flags.timer);

    const context = await this.getContext(flags.verbose);

    // Load the package
    const repo = context.repo;
    timer.time("Package scan completed");

    let kind = flags.client;
    if(flags.azure) {
        kind = flags.azure;
    }

    if(flags.buildTools) {
        kind = flags.buildTools;
    }

    if(flags.server) {
        kind = flags.server;
    }

    const releaseGroup = repo.monoRepos.get(kind);
    if(releaseGroup === undefined) {
        throw new Error(`release group couldn't be found.`);
    }

    await generateMonoRepoInstallPackageJson(releaseGroup);
  }
}
