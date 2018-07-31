import { api, types } from "@prague/routerlicious/dist/client-api";
import { EventEmitter } from "events";
import * as uuid from "uuid/v4";
import { revision } from "./constants";
import { TokenGenerator } from "./tokenGenerator";

export interface IWindow {
    id: string;

    noteId: string;
}

export class WindowList extends EventEmitter {
    public static async Load(userName: string, generator: TokenGenerator): Promise<WindowList> {
        const windowListId = `windows-${userName}-${revision}`;
        const token = generator.generate(windowListId);

        const document = await api.load(windowListId, { token });
        const connectedP = new Promise<void>((resolve) => {
            document.once("connected", () => resolve());
        });

        const root = await document.getRoot();
        const rootView = await root.getView();
        if (!document.existing) {
            rootView.set("windows", document.createMap());
        } else {
            await rootView.wait("windows");
        }

        const windows = rootView.get("windows") as types.IMap;
        const windowsView = await windows.getView();

        return new WindowList(windows, windowsView, connectedP);
    }

    private windows = new Map<string, IWindow>();

    constructor(windows: types.IMap, private windowsView: types.IMapView, public connected: Promise<void>) {
        super();

        windowsView.forEach((value: string, key: string) => {
            this.addWindowCore(key, value, false);
        });

        windows.on(
            "valueChanged",
            (changed, local) => {
                // Skip local changes
                if (local) {
                    return;
                }

                if (windowsView.has(changed.key)) {
                    this.addWindowCore(changed.key, windowsView.get(changed.key), false);
                } else {
                    // deleted window
                    this.removeWindow(changed.key, false);
                }
            });
    }

    public openWindow(noteId: string) {
        const newId = uuid();
        const window = this.addWindowCore(newId, noteId, true);
        return window;
    }

    public closeWindow(id: string) {
        this.removeWindow(id, true);
    }

    public getWindows(): Map<string, IWindow> {
        return this.windows;
    }

    public get(id: string): IWindow {
        return this.windows.get(id);
    }

    public has(id: string): boolean {
        return this.windows.has(id);
    }

    private addWindowCore(id: string, noteId: string, local: boolean): IWindow {
        if (local) {
            this.windowsView.set(id, noteId);
        }

        const window = { id, noteId };
        this.windows.set(id, window);
        this.emit("open", id, local);

        return window;
    }

    private removeWindow(id: string, local: boolean) {
        if (local) {
            this.windowsView.delete(id);
        }

        this.windows.delete(id);
        this.emit("close", id, local);
    }
}
