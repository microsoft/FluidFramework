// TODO: Replace w/ direct use of web-loader instead of using /loader/ route.
export const chainload = (componentId: string, docId: string) => {
    return new Promise<void>(resolve => {
        chrome.tabs.create({ url: `http://localhost:3000/loader/${docId}?chaincode=${componentId}@latest` }, tab => {
            const historyListener = (details) => {
                if (details.tabId !== tab.id) {
                    return;
                }
        
                if (details.url.split("?").length !== 1) {
                    return;
                }
        
                chrome.tabs.remove(tab.id)
                chrome.webNavigation.onHistoryStateUpdated.removeListener(historyListener);
                resolve();
            }
        
            chrome.webNavigation.onHistoryStateUpdated.addListener(historyListener);
        });
    });
}