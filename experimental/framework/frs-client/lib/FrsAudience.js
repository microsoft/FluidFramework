/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ServiceAudience } from "@fluid-experimental/fluid-framework";
export class FrsAudience extends ServiceAudience {
    createServiceMember(audienceMember) {
        return {
            userId: audienceMember.user.id,
            userName: audienceMember.user.name,
            connections: [],
            additionalDetails: audienceMember.user.additionalDetails,
        };
    }
}
//# sourceMappingURL=FrsAudience.js.map