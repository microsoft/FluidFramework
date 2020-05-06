/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const contentDivId = "content";

function load() {

    const url = parent.document.getElementById('link').value;
    const storageToken =  parent.document.getElementById('storageToken').value;
    const socketToken =  parent.document.getElementById('socketToken').value;
    const clientId = parent.document.getElementById('clientId').value;
    const clientSecret = parent.document.getElementById('clientSecret').value;

    const div = document.getElementById(contentDivId);
    div.style.margin = '0';

    const tokenApiConfig = {
        getStorageToken: () => storageToken,
        getWebsocketToken: () => socketToken,
    };

    tinyWebLoader.loadFluidContainer(
        url,
        div,
        tokenApiConfig,
        clientSecret,
    );
}

load();
