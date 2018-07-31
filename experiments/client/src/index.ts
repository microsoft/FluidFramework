import * as prague from "@prague/routerlicious";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import defaultMenu = require("electron-default-menu");
import * as os from "os";
import * as path from "path";
import * as url from "url";
import { NoteList } from "./noteList";
import { TokenGenerator } from "./tokenGenerator";
import { WindowList } from "./windowList";

// register default prague endpoint
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "suspicious-northcutt";
prague.api.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

// Get a token generator
const secret = "86efe90f7d9f5864b3887781c8539b3a";
const generator = new TokenGenerator(tenantId, secret);

// Begin loading the list of windows for the given user
const username = os.userInfo().username;
const windowListP = WindowList.Load(username, generator);
const noteListP = NoteList.Load(username, generator);

const windowMap = new Map<string, BrowserWindow>();
let preserveWindows = false;

function createWindow(id: string, noteId: string, windowList: WindowList) {
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
        pathname: path.join(__dirname, "../views/index.html"),
        protocol: "file:",
        slashes: true,
    }));
    win.webContents.on("did-finish-load", () => win.webContents.send("load-note", noteId));
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

function createNote(noteList: NoteList, windowList: WindowList, noteId?: string) {
    noteId = noteId ? noteId : noteList.addNote().id;
    const window = windowList.openWindow(noteId);
    createWindow(window.id, window.noteId, windowList);
}

let notesWindow: BrowserWindow;
function showAllNotes() {
    if (notesWindow) {
        return;
    }

    // Create the browser window.
    notesWindow = new BrowserWindow({width: 800, height: 600});
    notesWindow.setTitle("Notes");
    notesWindow.webContents.on("did-finish-load", () => notesWindow.webContents.send("load-notes-list", username));

    // and load the index.html of the app.
    notesWindow.loadURL(url.format({
        pathname: path.join(__dirname, "../views/notes.html"),
        protocol: "file:",
        slashes: true,
    }));

    notesWindow.on(
        "closed",
        () => {
            notesWindow = null;
        });
}

async function start(): Promise<void> {
    const [windowList, noteList] = await Promise.all([windowListP, noteListP]);

    const menu = defaultMenu(app, shell);
    menu.splice(1, 0, {
        label: "File",
        submenu: [
            {
                accelerator: "CmdOrCtrl+N",
                click: () => {
                    createNote(noteList, windowList);
                },
                enabled: true,
                label: "New",
                visible: true,
            },
        ],
    });

    ipcMain.on("open-note", (event, id) => {
        createNote(noteList, windowList, id);
    });

    const viewSubmenu = menu[3].submenu;
    viewSubmenu.push({ type: "separator" });
    viewSubmenu.push({
        accelerator: "CmdOrCtrl+L",
        click: () => {
            showAllNotes();
        },
        label: "All Notes",
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

    // Listen for updates to the notes window list
    windowList.on(
        "open",
        (id: string, local: boolean) => {
            if (local) {
                return;
            }

            createWindow(id, windowList.getWindows().get(id).noteId, windowList);
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

    // Open already opened notes
    const existingWindows = windowList.getWindows();
    for (const [id, window] of existingWindows) {
        createWindow(id, window.noteId, windowList);
    }

    // After connection see if we need to bring up a new window
    windowList.connected.then(() => {
        // Create a new note if one isn't already open
        if (existingWindows.size === 0) {
            createNote(noteList, windowList);
        }
    });
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
