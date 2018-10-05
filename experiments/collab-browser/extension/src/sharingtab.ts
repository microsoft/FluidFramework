import { TabRef } from "./tabRef";
import { navigateTab, getCurrentWindow, updateWindow, createWindow, queryTabs, windowFromTabId } from "./utils";

interface IBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

const getAreaIntersection = (left: IBounds, right: IBounds) => {
    const l = Math.max(left.left, right.left);
    const r = Math.min(left.left + left.width, right.left + right.width);
    const w = r - l;

    const t = Math.max(left.top, right.top);
    const b = Math.min(left.top + left.height, right.top + right.height);
    const h = b - t;

    return w * h;
}

const getScreenBoundsForWindow = (wnd: chrome.windows.Window) => {
    return new Promise<{ left: number, top: number, width: number, height: number }>(resolve => {
        (chrome.system as any).display.getInfo(layouts => {
            let bounds = layouts[0].bounds;
            let area = getAreaIntersection(bounds, wnd as IBounds);

            for (let i = 1; i < layouts.length; i++) {
                const candidate = layouts[i].bounds;
                const candidateArea = getAreaIntersection(candidate, wnd as IBounds);
                if (candidateArea > area) {
                    bounds = candidate;
                    area = candidateArea;
                }
            }

            resolve(bounds);
        });
    });
}

const sideBySideBounds = async (wnd: chrome.windows.Window) => {
    const screen = await getScreenBoundsForWindow(wnd);
    const leftInfo = Object.assign({}, screen) as chrome.windows.UpdateInfo;
    leftInfo.width = Math.floor(leftInfo.width / 2);
    leftInfo.state = "normal";
    
    const rightInfo: any = Object.assign({}, leftInfo);
    rightInfo.left += rightInfo.width;

    //leftInfo.height = Math.floor(leftInfo.height * 0.66);

    return [leftInfo, rightInfo];
}

export class SharingTab {
    public readonly shareDocUrl: string;
    private tabRef = new TabRef();

    constructor (public readonly shareDocId: string) {
        this.shareDocUrl = `http://localhost:3000/sharedText/${shareDocId}?template=empty`;
    }

    public async get(resizeLeft: boolean) {
        const left = await getCurrentWindow();
        const [leftInfo, rightInfo] = await sideBySideBounds(left);
        if (resizeLeft) {
            await updateWindow(left.id, leftInfo);
        }

        let right: chrome.windows.Window;
        if (this.tabRef.isClosed) {
            rightInfo.url = "about:blank";
            right = await createWindow(rightInfo);
            this.tabRef = new TabRef((await queryTabs({ windowId: right.id }))[0].id);
        } else {
            right = await windowFromTabId(this.tabRef.id);
            await updateWindow(right.id, rightInfo);
        }

        const tab = await this.tabRef.tab;
        if (tab.url.split("?")[0] !== this.shareDocUrl.split("?")[0]) {
            console.log(`*** Navigating Share Tab:`);
            console.log(`    ${tab.url} -> ${this.shareDocUrl}`);
            await navigateTab(this.tabRef.id, this.shareDocUrl);
        }
        
        return this.tabRef.id;
    }
}

export class RemotingTab {
    public readonly shareDocUrl: string;
    private tabRef = new TabRef();

    constructor (public readonly remoteDocId: string) {
        this.shareDocUrl = `http://localhost:3000/loader/${this.remoteDocId}`
    }

    public async get() {
        const left = await getCurrentWindow();
        const [leftInfo, rightInfo] = await sideBySideBounds(left);
        await updateWindow(left.id, leftInfo);

        let right: chrome.windows.Window;
        if (this.tabRef.isClosed) {
            rightInfo.url = "about:blank";
            right = await createWindow(rightInfo);
            this.tabRef = new TabRef((await queryTabs({ windowId: right.id }))[0].id);
        } else {
            right = await windowFromTabId(this.tabRef.id);
            await updateWindow(right.id, rightInfo);
        }

        const tab = await this.tabRef.tab;
        if (tab.url.split("?")[0] !== this.shareDocUrl.split("?")[0]) {
            console.log(`*** Navigating Remote Tab:`);
            console.log(`    ${tab.url} -> ${this.shareDocUrl}`);
            await navigateTab(this.tabRef.id, this.shareDocUrl);
        }
        
        return this.tabRef.id;
    }
}