/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Callback for moving the toggle switch
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

// Set initial state of the toggle switch based on storage data
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

// Show the dropdown list
dropdownButton.onclick = function(element) {
    dropdownContent.classList.toggle("show");
}

// Close the dropdown list if the user clicks outside the element
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

// Set the dropdown list contents based off the URLs found in storage
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

// Regex for checking if valid URL
function isValidUrl(string) {
    try {
        new URL(string);
    } catch (_) {
        return false;
    }

    return true;
}

// Add the URL in the text field to the list of URLs to listen to if it is a valid URL
addUrlButton.onclick = function(event) {
    if (isValidUrl(addUrlText.value)) {
        chrome.storage.sync.get("additionalUrls", function(data) {
            const newUrls = data.additionalUrls || [];
            newUrls.push(addUrlText.value);
            addUrlText.value = "";
            chrome.storage.sync.set({ additionalUrls: newUrls });
            setUrls();
        });
    } else {
        alert("Please enter URL in correct format");
    }

}

setUrls();