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
    const leftBounds = Object.assign({}, screen);
    leftBounds.width = Math.floor(leftBounds.width / 2);
    
    const rightBounds: any = Object.assign({}, leftBounds);
    rightBounds.left += rightBounds.width;

    return [leftBounds, rightBounds];
}

export class SharingTab {
    public readonly shareDocId = `share-${Math.random().toString(36).substring(2, 6)}`
    public readonly shareDocUrl = `http://localhost:3000/sharedText/${this.shareDocId}?template=empty`;
    private tabRef = new TabRef();

    public async get() {
        const left = await getCurrentWindow();
        const [leftBounds, rightBounds] = await sideBySideBounds(left);
        await updateWindow(left.id, leftBounds);

        let right: chrome.windows.Window;
        if (this.tabRef.isClosed) {
            right = await createWindow(rightBounds);
            this.tabRef = new TabRef((await queryTabs({ windowId: right.id }))[0].id);
        } else {
            right = await windowFromTabId(this.tabRef.id);
            await updateWindow(right.id, rightBounds);
        }

        const tab = await this.tabRef.tab;
        if (tab.url !== this.shareDocUrl) {
            await navigateTab(this.tabRef.id, this.shareDocUrl);
        }
        
        return this.tabRef.id;
    }
}