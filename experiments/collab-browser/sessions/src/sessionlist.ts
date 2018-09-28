import { SessionManager } from "./sessionmanager";

export class SessionList<T> {
    public mount(sessionManager: SessionManager<T>) {
        const div = document.createElement("div");

        const update = () => {
            while (div.lastChild) {
                div.removeChild(div.lastChild);
            }

            for (const docId of sessionManager.sessions) {
                const a = document.createElement("a");
                a.href = `http://localhost:3000/loader/${docId}`;
                a.textContent = docId;
                div.appendChild(a);
            }
        };

        sessionManager.on("valueChanged", update);
        update();

        return div;
    }
}
