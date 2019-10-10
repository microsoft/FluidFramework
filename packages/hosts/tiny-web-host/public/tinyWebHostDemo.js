/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const contentDivId = "content";

function load() {

    const url = parent.document.getElementById('link').value;
    const token = parent.document.getElementById('token').value;
    const clientId = parent.document.getElementById('clientId').value;
    const clientSecret = parent.document.getElementById('clientSecret').value;

    const div = document.getElementById(contentDivId);
    div.style.margin = '0';

    tinyWebLoader.loadFluidComponent(
        url,
        div,
        () => token,
        clientId,
        clientSecret,
    );
}

load();
