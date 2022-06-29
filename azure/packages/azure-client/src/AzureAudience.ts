/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/common-utils";
import { IAzureAudience, AzureMember, AzureUser } from "./interfaces";

export class AzureAudience extends ServiceAudience<AzureMember> implements IAzureAudience {
  /**
   * Creates a {@link @fluidframework/fluid-static#ServiceAudience} from the provided
   * {@link @fluidframework/protocol-definitions#IClient | audience member}.
   *
   * @param audienceMember - Audience member for which the `ServiceAudience` will be generated.
   * Note: its {@link @fluidframework/protocol-definitions#IClient.user} is required to be an {@link AzureUser}.
   *
   * @internal
   */
  protected createServiceMember(audienceMember: IClient): AzureMember {
    const azureUser = audienceMember.user as AzureUser;
    assert(azureUser?.name !== undefined, "Provided user was not an \"AzureUser\".");

    return {
      userId: audienceMember.user.id,
      userName: azureUser.name,
      connections: [],
      additionalDetails: azureUser.additionalDetails as unknown,
    };
  }
}
