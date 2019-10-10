/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const contentDivId = "content";

function go() {

    cacheInputs();

    const iframe = document.createElement('iframe');
    const container = document.getElementById('container');

    iframe.src = "./tinyWebHostDemo.html";
    iframe.id = `theframe${container.childElementCount}`;

    const iframeContainerDiv = document.createElement('div');
    iframeContainerDiv.id = `thediv${container.childElementCount}`;
    iframeContainerDiv.style.display = 'inline-block';
    addCloseIframeButton(iframeContainerDiv, iframe.id);

    iframeContainerDiv.appendChild(iframe);
    container.appendChild(iframeContainerDiv);
}

function useTinyWebHost(iframeDocument) {
    const useIframe = document.getElementById('hostingMode').value === 'iframe';

    var loadFluidScript = document.createElement('script');
    loadFluidScript.type = "text/javascript";
    loadFluidScript.src = "../dist/main.bundle.js";

    // Onload, execute the tiny-web-host bundle
    loadFluidScript.onload = () => {
        const url = document.getElementById('link').value;
        const token = document.getElementById('token').value;
        const clientId = document.getElementById('clientId').value;
        const clientSecret = document.getElementById('clientSecret').value;

        // Example of using tiny-web-host
        const runScript = document.createElement('script');
        if (useIframe) {
            runScript.text = `
            tinyWebLoader.loadIFramedFluidComponent(
                "${url}",
                document.getElementById('${contentDivId}'),
                () => {"${token}"},
                "${clientId}",
                "${clientSecret}",
                );
            `;
        } else {
            runScript.text = `
            tinyWebLoader.loadFluidComponent(
                "${url}",
                document.getElementById('${contentDivId}'),
                () => {"${token}"},
                "${clientId}",
                "${clientSecret}",
                );
            `;
        }
        iframeDocument.body.appendChild(runScript);
    }

    iframeDocument.body.style.margin = '0';
    iframeDocument.body.appendChild(loadFluidScript);
}


function createDivForContainerToLoadInto(iframeDocument) {
    const useFixedSize = document.getElementById('layoutMode').value === 'fixed';

    const newdiv = document.createElement('div');
    newdiv.id = contentDivId;
    newdiv.style.position = "absolute";
    if (useFixedSize) {
        newdiv.style.top = "0";
        newdiv.style.left = "0";
        newdiv.style.bottom = "0";
        newdiv.style.right = "0";
    }
    iframeDocument.body.appendChild(newdiv);
}

function addCloseIframeButton(iframeContainerDiv, id) {
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close Container';
    closeButton.style.width = '45vw';
    closeButton.style.display = 'block';
    closeButton.onclick = () => {
        document.getElementById(id).remove();
        const removeDiv = document.getElementById(iframeContainerDiv.id);
        removeDiv.style.visibility = 'hidden';
        removeDiv.style.width = '0px';
        removeDiv.style.height = '0px';
    }
    iframeContainerDiv.appendChild(closeButton);
}


// Fill Tokens and links
function prefillInputs() {
    const token = localStorage.getItem('token');
    const link = localStorage.getItem('link');

    if (token) document.getElementById('token').value = token;
    if (link) document.getElementById('link').value = link;
}

// Cache tokens and links locally.
function cacheInputs() {
    localStorage.setItem('token', document.getElementById('token').value);
    localStorage.setItem('link', document.getElementById('link').value);
}

window.onload = prefillInputs;