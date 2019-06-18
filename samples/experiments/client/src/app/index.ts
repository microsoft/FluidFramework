/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as prague from "@prague/routerlicious";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import defaultMenu = require("electron-default-menu");
import * as nconf from "nconf";
import * as path from "path";
import * as url from "url";
import { NoteList, WindowList } from "../models";
import { TokenManager } from "./tokenManager";

interface IElectronConfig {
    routerlicious: string;
    historian: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    notaServer: string;
}

const file = path.join(__dirname, "../../config.electron.json");
const config = nconf.argv().env("__" as any).file(file).use("memory").get() as IElectronConfig;

prague.api.socketStorage.registerAsDefault(config.routerlicious, config.historian, config.tenantId);

const windowMap = new Map<string, BrowserWindow>();
let preserveWindows = false;

function createWindow(id: string, noteId: string, windowList: WindowList, tokenManager: TokenManager) {
    const tokenP = tokenManager.getTokenForNote(noteId);
    const windowOptions: any = {width: 800, height: 600};
    const focused = BrowserWindow.getFocusedWindow();
    if (focused) {
        const [x, y] = focused.getPosition();
        windowOptions.x = x + 25;
        windowOptions.y = y + 25;
    } else if (windowMap.size > 0) {
        const [x, y] = Array.from(windowMap.values()).pop().getPosition();
        windowOptions.x = x + 25;
        windowOptions.y = y + 25;
    }

    // Create the browser window.
    const win = new BrowserWindow(windowOptions);

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, "../../views/note.html"),
        protocol: "file:",
        slashes: true,
    }));
    win.webContents.on("did-finish-load", () => {
        tokenP.then(
            (token) => {
                win.webContents.send("load-note", token, config.routerlicious, config.historian, config.tenantId);
            });
    });
    win.setTitle(noteId);

    windowMap.set(id, win);
    win.on(
        "closed",
        () => {
            // If a remote close the window will no longer be in the list. Otherwise we explicitly remove it.
            if (windowList.has(id) && !preserveWindows) {
                windowList.closeWindow(id);
            }

            windowMap.delete(id);
        });

    // Open the DevTools.
    // win.webContents.openDevTools();
}

function createNote(noteList: NoteList, windowList: WindowList, tokenManager: TokenManager, noteId?: string) {
    noteId = noteId ? noteId : noteList.addNote().id;
    const window = windowList.openWindow(noteId);
    createWindow(window.id, window.noteId, windowList, tokenManager);
}

let notesWindow: BrowserWindow;
function showAllNotes(token: string) {
    if (notesWindow) {
        return;
    }

    // Create the browser window.
    notesWindow = new BrowserWindow({width: 800, height: 600});
    notesWindow.setTitle("Notes");
    notesWindow.webContents.on(
        "did-finish-load",
        () => {
            notesWindow.webContents.send(
                "load-notes-list",
                token,
                config.routerlicious,
                config.historian,
                config.tenantId);
        });

    // and load the index.html of the app.
    notesWindow.loadURL(url.format({
        pathname: path.join(__dirname, "../../views/notes.html"),
        protocol: "file:",
        slashes: true,
    }));

    notesWindow.on(
        "closed",
        () => {
            notesWindow = null;
        });
}

export async function start(): Promise<void> {
    const tokenManager = new TokenManager(
        config.notaServer,
        config.clientId,
        config.clientSecret,
        "http://127.0.0.1:8000",
        "openid");

    const [notesToken, windowsToken] = await Promise.all([
        tokenManager.getNotesToken(),
        tokenManager.getWindowsTokens(),
    ]);

    const windowListP = WindowList.load(windowsToken);
    const noteListP = NoteList.load(notesToken);

    const [windowList, noteList] = await Promise.all([windowListP, noteListP]);

    const menu = defaultMenu(app, shell);
    menu.splice(1, 0, {
        label: "File",
        submenu: [
            {
                accelerator: "CmdOrCtrl+N",
                click: () => {
                    createNote(noteList, windowList, tokenManager);
                },
                enabled: true,
                label: "New",
                visible: true,
            },
        ],
    });

    ipcMain.on("open-note", (event, id) => {
        createNote(noteList, windowList, tokenManager, id);
    });

    const viewSubmenu = menu[3].submenu;
    viewSubmenu.push({ type: "separator" });
    viewSubmenu.push({
        accelerator: "CmdOrCtrl+L",
        click: () => {
            showAllNotes(notesToken);
        },
        label: "All Notes",
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

    // Open already opened notes
    await windowList.connected;

    // Listen for updates to the notes window list
    windowList.on(
        "open",
        (id: string, local: boolean) => {
            if (local) {
                return;
            }

            createWindow(id, windowList.getWindows().get(id).noteId, windowList, tokenManager);
        });

    windowList.on(
        "close",
        (id: string, local: boolean) => {
            if (local) {
                return;
            }

            if (windowMap.has(id)) {
                const window = windowMap.get(id);
                window.close();
            }
        });

    const existingWindows = windowList.getWindows();
    for (const [id, window] of existingWindows) {
        createWindow(id, window.noteId, windowList, tokenManager);
    }

    // Create a new note if one isn't already open
    if (existingWindows.size === 0) {
        createNote(noteList, windowList, tokenManager);
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on(
    "ready",
    () => {
        start().catch((exception) => {
            console.error(exception);
            app.quit();
        });
    });

// Quit when all windows are closed.
app.on("window-all-closed", () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    preserveWindows = true;
});

app.on("activate", () => {
    // TODO follow this
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    // if (win === null) {
    //     createWindow();
    // }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
