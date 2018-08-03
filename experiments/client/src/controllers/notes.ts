import { api as prague } from "@prague/routerlicious";
import { NoteList } from "../noteList";

// For local development
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "suspicious-northcutt";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

function renderNotes(notes: NoteList, openNote: (id: string) => void) {
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
            event.stopPropagation();
            event.preventDefault();
            openNote(note.id);
        };
        dt.appendChild(link);

        const dd = document.createElement("dd");
        dd.innerText = new Date(note.created).toString();

        noteList.appendChild(dt);
        noteList.appendChild(dd);
    }
}

export async function loadNotes(token: string, openNote: (id: string) => void): Promise<void> {
    const notes = await NoteList.Load(token);

    renderNotes(notes, openNote);
    notes.on("notesChanged", () => {
        renderNotes(notes, openNote);
    });
}
