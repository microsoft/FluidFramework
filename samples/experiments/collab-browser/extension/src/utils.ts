/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const tabFromId = (tabId: number) => new Promise<chrome.tabs.Tab>(resolve => chrome.tabs.get(tabId, resolve));

// Promisification of Chrome Extension APIs.
export const updateWindow       = (windowId: number, updateInfo: chrome.windows.UpdateInfo) => new Promise<chrome.windows.Window>(resolve => {  chrome.windows.update(windowId, updateInfo, resolve); });
export const getWindow          = (windowId: number) => new Promise<chrome.windows.Window>(resolve => { chrome.windows.get(windowId, resolve); });
export const getCurrentWindow   = () => new Promise<chrome.windows.Window>(resolve => { chrome.windows.getCurrent(resolve); });
export const getFocusedWindow   = () => new Promise<chrome.windows.Window>(resolve => { chrome.windows.getLastFocused(resolve); });
export const createWindow       = (createData?: chrome.windows.CreateData) => new Promise<chrome.windows.Window>(resolve => { chrome.windows.create(createData, resolve); });
export const queryTabs          = (queryInfo: chrome.tabs.QueryInfo) => new Promise<chrome.tabs.Tab[]>(resolve => { chrome.tabs.query(queryInfo, resolve); });
export const tabFromTabId       = (tabId: number) => new Promise<chrome.tabs.Tab>(resolve => { chrome.tabs.get(tabId, resolve); });
export const windowFromTabId    = (tabId: number) => new Promise<chrome.windows.Window>( async (resolve) => chrome.windows.get((await tabFromTabId(tabId)).windowId, resolve));
export const captureVisibleTab  = (windowId: number, options: chrome.tabs.CaptureVisibleTabOptions) => new Promise<string>((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, options, result => {
        // Note: If there was an error (e.g., the tab wasn't visible) and the callback does not check the value
        //       of 'lastError', Chrome will throw an uncaught exception.  Instead, break the Promise.
        const lastError = chrome.runtime.lastError;
        if (lastError) {
            reject(lastError);
        } else {
            resolve(result);
        }
    });
});

// Promisified query for the active tab in the current window.
export const getActiveTab = () => new Promise<chrome.tabs.Tab>(
    resolve => {
        chrome.tabs.query({ active: true, currentWindow: true },
            (tabs) => { resolve(tabs[0]) });
    });

export const getIsTabIdActive = async (tabId: number) => {
    const activeTab = await getActiveTab();

    // Note: 'activeTab' will be undefied if the user activates a tab that is inaccessible to the extension (e.g., devtools).
    return activeTab && activeTab.id === tabId;
}

export const navigateTab = (tabId: number, url: string) => {
    let resolve: () => void;
    const promise = new Promise(resolver => resolve = resolver);

    const listener = (updatedId, info) => {
        if (updatedId === tabId && info.status === 'complete') {
            resolve();
            chrome.tabs.onUpdated.removeListener(listener);
        }
    };

    chrome.tabs.update(tabId, { url });
    chrome.tabs.onUpdated.addListener(listener);

    return promise;
}
