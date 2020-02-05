/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { loadFluidComponent } from "@prague/tiny-web-host";

export function runner() {

    // TODO #1148 - remove usage of 'chaincode' below
    // tslint:disable-next-line: max-line-length
    const url = "https://www.wu2.prague.office-int.com/loader/prague/ChangeThisValue-150320739?chaincode=@chaincode/shared-text@0.6.9051";
    // Future: buildUrl("@component/shared-text@0.6.9051", "fluid", `ChangeThisValue-${date.getTime()}`);

    // Future: Fill in SPO relevant info
    loadFluidComponent(
        url,
        async () => "",
        document.getElementById("container") as HTMLDivElement,
        "",
        "",
        "",
    );
}

export function buildUrl(component: string, tenant: string, containerId: string) {
    return `https://www.wu2.prague.office-int.com/loader/${tenant}/${containerId}?chaincode=${component}`;
}
