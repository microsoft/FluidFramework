/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
    const storageToken = localStorage.getItem('storageToken');
    const socketToken = localStorage.getItem('socketToken');
    const clientId = localStorage.getItem('clientId');
    const link = localStorage.getItem('link');

    if (storageToken) document.getElementById('storageToken').value = storageToken;
    if (socketToken) document.getElementById('socketToken').value = socketToken;
    if (clientId) document.getElementById('clientId').value = clientId;
    if (link) document.getElementById('link').value = link;
}

// Cache tokens and links locally.
function cacheInputs() {
    localStorage.setItem('storageToken', document.getElementById('storageToken').value);
    localStorage.setItem('socketToken', document.getElementById('socketToken').value);
    localStorage.setItem('clientId', document.getElementById('clientId').value);
    localStorage.setItem('link', document.getElementById('link').value);
}

window.onload = prefillInputs;