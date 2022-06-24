/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { assert } from '@fluidframework/common-utils'
import { IAzureAudience, AzureMember, AzureUser } from "./interfaces";

export class AzureAudience extends ServiceAudience<AzureMember> implements IAzureAudience {
  /**
   * @internal
   */
  protected createServiceMember(audienceMember: IClient): AzureMember {
    const azureUser = audienceMember.user as AzureUser;
    assert(azureUser !== undefined && azureUser.name !== undefined, "Provided user was not an \"AzureUser\".");

    return {
      userId: audienceMember.user.id,
      userName: azureUser.name,
      connections: [],
      additionalDetails: azureUser.additionalDetails,
    };
  }
}
