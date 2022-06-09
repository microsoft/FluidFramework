/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { IAzureAudience, AzureMember, AzureUser } from "./interfaces";

export class AzureAudience extends ServiceAudience<AzureMember> implements IAzureAudience {
  /**
   * @internal
   */
  protected createServiceMember(audienceMember: IClient): AzureMember {
    return {
      userId: audienceMember.user.id,
      userName: (audienceMember.user as AzureUser).name,
      connections: [],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      additionalDetails: (audienceMember.user as AzureUser).additionalDetails,
    };
  }
}
