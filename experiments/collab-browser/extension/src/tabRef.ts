import { EventEmitter } from "events";
import { tabFromId, getIsTabIdActive } from "./utils";

export class TabRef extends EventEmitter {
    private _tabId: number;

    constructor (tabId: number = NaN) {
        super();

        this._tabId = tabId;

        if (!this.isClosed) {
            chrome.tabs.onReplaced.addListener(this.onReplaced);
            chrome.tabs.onRemoved.addListener(this.onRemoved);
        }
    }

    public get isClosed() { return isNaN(this._tabId); }

    private readonly onReplaced = (added: number, removed: number) => {
        if (removed === this._tabId) {
            this._tabId = added;
        }
    }

    private readonly onRemoved = (removed) => {
        if (removed === this._tabId) {
            this._tabId = NaN;
            chrome.tabs.onReplaced.removeListener(this.onReplaced);
            chrome.tabs.onRemoved.removeListener(this.onRemoved);
            this.emit("removed");
        }
    }

    public get id()         { return this._tabId; }
    public get tab()        { return tabFromId(this.id); }
    public get isActive()   { return getIsTabIdActive(this.id); }
}
