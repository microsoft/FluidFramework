import * as prague from "./prague";
import { refTypeNameToComponent, FlowViewContext, SheetletState } from "../../../routerlicious/packages/client-ui/src/ui";
import { CollaborativeWorkbook } from "../../../routerlicious/packages/client-ui/src/calc"

function openWorkbook(docName: string) {
    prague
        .open(docName)
        .then(docView => docView.get<prague.CollaborativeMap>("workbook").getView())
        .then(mapView => {
            const workbook = new CollaborativeWorkbook(mapView, 7, 7, [
                ['Player', 'Euchre', 'Bridge', 'Poker', 'Cribbage', 'Go Fish', 'Total Wins'],
                ['Daniel', "0", "0", "0", "0", "5", '=SUM(B2:F2)'],
                ['Kurt',   "2", "3", "0", "3", "0", '=SUM(B3:F3)'],
                ['Sam',    "3", "4", "0", "2", "0", '=SUM(B4:F4)'],
                ['Steve',  "1", "1", "5", "1", "0", '=SUM(B5:F5)'],
                ['Tanvir', "3", "3", "0", "4", "0", '=SUM(B6:F6)'],
                ['Total Played', "=SUM(B2:B6)", "=SUM(C2:C6)", "=SUM(D2:D6)", "=SUM(E2:E6)", "=SUM(F2:F6)", "=SUM(G2:F6)"]
            ]);

            const sheetlet = refTypeNameToComponent.get("sheetlet");
            document.body.innerHTML = `
                <h3>Editing: ${docName}</h3>
                <table></table>
            `;

            document.body.innerHTML = "";
            document.body.appendChild(
                sheetlet.mount(
                    new SheetletState(),
                    new FlowViewContext(undefined, undefined,
                        new Map<string, any>([["workbook", workbook]]))))
        });
}

const docName = new URLSearchParams(window.location.search).toString().split("=")[0];
if (!docName) {
    document.body.innerHTML = `
        <input id="openBox"/>Open<button id="openButton"/>
    `;

    document.getElementById('openButton').addEventListener("click", () => {
        const docName = (document.getElementById("openBox") as HTMLInputElement).value;
        openWorkbook(docName);
    });
} else {
    openWorkbook(docName);
}