let toggleSwitch = document.getElementById('toggle-switch');
toggleSwitch.onclick = function(element) {
    if (element.target.className === "off") {
        element.target.className = "on";
        chrome.storage.sync.set({interceptDisabled: true})
    } else {
        element.target.className = "off";
        chrome.storage.sync.set({interceptDisabled: false})
    }
};

chrome.storage.sync.get('interceptDisabled', function(data) {
    if(data.interceptDisabled === true){
        toggleSwitch.checked = true;
        toggleSwitch.className = "on";
    } else {
        toggleSwitch.checked = undefined;
        toggleSwitch.className = "off"
    }
});
