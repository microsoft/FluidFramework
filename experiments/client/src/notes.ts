import { api as prague } from "@prague/routerlicious";
import * as electron from "electron";
import { NoteList } from "./noteList";
import { TokenGenerator } from "./tokenGenerator";

// For local development
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "suspicious-northcutt";

// Get a token generator
const secret = "86efe90f7d9f5864b3887781c8539b3a";
const generator = new TokenGenerator(tenantId, secret);

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

function renderNotes(notes: NoteList) {
    const noteList = document.getElementById("note-list");
    noteList.innerHTML = "";

    const notesArray = Array.from(notes.getNotes().values());
    notesArray.sort((a, b) => b.created - a.created);

    for (const note of notesArray) {
        const dt = document.createElement("dt");
        const link = document.createElement("a");
        link.innerText = note.id;
        link.href = "#";
        link.onclick = (event) => {
            electron.ipcRenderer.send("open-note", note.id);
            event.stopPropagation();
            event.preventDefault();
        };
        dt.appendChild(link);

        const dd = document.createElement("dd");
        dd.innerText = new Date(note.created).toString();

        noteList.appendChild(dt);
        noteList.appendChild(dd);
    }
}

async function run(username: string): Promise<void> {
    const notes = await NoteList.Load(username, generator);

    renderNotes(notes);
    notes.on("notesChanged", () => {
        renderNotes(notes);
    });
}

electron.ipcRenderer.on("load-notes-list", (event, id) => {
    run(id);
});
