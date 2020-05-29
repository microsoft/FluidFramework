/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const toggleSwitch = document.getElementById("toggle-switch");
toggleSwitch.onclick = function(element) {
    if (element.target.className === "off") {
        element.target.className = "on";
        chrome.storage.sync.set({ interceptDisabled: true });
    } else {
        element.target.className = "off";
        chrome.storage.sync.set({ interceptDisabled: false });
    }
};

chrome.storage.sync.get("interceptDisabled", function(data) {
    if (data.interceptDisabled === true) {
        toggleSwitch.checked = true;
        toggleSwitch.className = "on";
    } else {
        toggleSwitch.checked = undefined;
        toggleSwitch.className = "off";
    }
});

const dropdownButton = document.getElementById("dropdown-button");
const dropdownContent = document.getElementById("dropdown-content");

dropdownButton.onclick = function(element) {
    dropdownContent.classList.toggle("show");
}

window.onclick = function(event) {
    if (!event.target.matches(".dropbtn")) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        var i;
        for (i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.classList.contains("show")) {
                openDropdown.classList.remove("show");
            }
        }
    }
};

const addUrlButton = document.getElementById("url-input-btn");
const addUrlText = document.getElementById("url-input");

const setUrls = function() {
    chrome.storage.sync.get("additionalUrls", function(data) {
        if (data.additionalUrls !== undefined) {
            const urlList = data.additionalUrls;
            const htmlElements = [];
            urlList.forEach(url => {
                const newElement = document.createElement("div");
                newElement.className = "dropdown-content-item-container";
                const newText = document.createElement("p");
                newText.innerHTML = url;
                newText.className = "dropdown-content-item-text";
                const newButton = document.createElement("button");
                newButton.innerHTML = "X";
                newButton.className = "dropdown-content-item-button";
                newButton.onclick = function(data) {
                    chrome.storage.sync.get("additionalUrls", function(data) {
                        let newUrls = data.additionalUrls || [];
                        newUrls = newUrls.filter((value, index, array) => value !== url);
                        chrome.storage.sync.set({ additionalUrls: newUrls });
                        setUrls();
                    });
                }
                newElement.appendChild(newText);
                newElement.appendChild(newButton);
                htmlElements.push(newElement);
            });

            dropdownContent.innerHTML = "";
            htmlElements.forEach(el => dropdownContent.appendChild(el));
        }
    });
}

addUrlButton.onclick = function(event) {
    chrome.storage.sync.get("additionalUrls", function(data) {
        const newUrls = data.additionalUrls || [];
        newUrls.push(addUrlText.value);
        addUrlText.value = "";
        chrome.storage.sync.set({ additionalUrls: newUrls });
        setUrls();
    });
}

setUrls();