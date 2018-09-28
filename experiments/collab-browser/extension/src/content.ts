const evalInPage = (script: string) => {
    const scriptElm = document.createElement('script');
    scriptElm.textContent = script;
    (document.head || document.documentElement).appendChild(scriptElm);
    scriptElm.remove();
}

chrome.runtime.onMessage.addListener((msg, sender, response) => {
    switch (msg.type) {
        case "insertComponent":
            evalInPage(`insertComponent("${msg.componentType}", ${JSON.stringify(msg.componentState)})`);
            break;
    }
});