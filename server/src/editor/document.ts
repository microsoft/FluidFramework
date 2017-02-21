import * as $ from "jquery";
import * as Quill from "quill";
import * as sharedb from "sharedb/lib/client";
import InkCanvas from "../canvas/inkCanvas";
import { Document as DocumentModel } from "../canvas/models/document";
import { RichText } from "../canvas/models/richText";
import ChartBlot from "./blots/charts";
import VideoBlot from "./blots/video";

let BlockEmbed = Quill.import("blots/block/embed");

Quill.register(BlockEmbed);
Quill.register(VideoBlot);
Quill.register(ChartBlot);

export class Document {
    constructor(element: HTMLElement, model: DocumentModel) {
        let inkP = model.getInkLayer();
        let richTextP = model.getRichText();

        let inkDiv = document.createElement("div");
        let documentDiv = document.createElement("div");
        element.appendChild(documentDiv);
        element.appendChild(inkDiv);

        inkP.then((inkModel) => {
            let inkCanvas = new InkCanvas(inkDiv, inkModel);
        });

        richTextP.then((richTextModel) => {
            // Construct the UI for the element
            let toolbar = document.createElement("div");
            toolbar.innerHTML =
                `<div id="toolbar">
                    <button class="ql-bold">Bold</button>
                    <button class="ql-italic">Italic</button>
                    <button class="fa fa-play"></button>
                    <button class="fa fa-area-chart"></button>
                </div>`;
            let editor = document.createElement("div");
            documentDiv.appendChild(toolbar);
            documentDiv.appendChild(editor);

            // create the editor
            let quill = new Quill(editor, {
                modules: {
                    toolbar,
                },
                theme: "snow",
            });

            // Set the contents and populate events
            quill.setContents(richTextModel.data);
            quill.on("text-change", (delta, oldDelta, source) => {
                if (source !== "user") {
                    return;
                }

                richTextModel.submitOp(delta, { source: quill });
            });

            richTextModel.on("op", (op, source) => {
                if (source === quill) {
                    return;
                }

                quill.updateContents(op);
            });

            // Bind the custom buttons
            $(toolbar).find(".fa-play").click(() => {
                let range = quill.getSelection(true);
                quill.insertText(range.index, "\n", Quill.sources.USER);
                let url = "https://www.youtube.com/embed/QHH3iSeDBLo?showinfo=0";
                quill.insertEmbed(range.index + 1, "video", url, Quill.sources.USER);
                // quill.formatText(range.index + 1, 1, { height: "170", width: "400" });
                quill.setSelection(range.index + 2, Quill.sources.SILENT);
            });

            $(toolbar).find(".fa-area-chart").click(() => {
                let range = quill.getSelection(true);
                quill.insertText(range.index, "\n", Quill.sources.USER);

                // Disable rules for simplicity with Ivy input format
                let chartDef = {
                    hasDataLabels: false,
                    legend: {
                        edge: 1,
                        edgePosition: 1,
                        title: {
                            edge: 1,
                            edgePosition: 1,
                            text: "Legend Title",
                        },
                    },
                    seriesData: [
                        {
                            data: {
                                2: [
                                    69.14964017037771, 82.55589380290198, 77.7992589146683,
                                    47.079431577865975, 61.0278147452978, 36.828990405761814,
                                    71.27523285013173, 18.651273016245575, 94.25718643974449, 50.32715058212624],
                            },
                            id: "i0",
                            layout: "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58",
                            title: "Series 1",
                        },
                        {
                            data: {
                                2: [
                                    52.2401034787816, 16.221559646645183, 44.47911083227592,
                                    49.707334744306294, 84.95812020684563, 49.01542136996819,
                                    18.300268885128506, 66.53927309022224, 45.52806497921968, 57.46258907835091],
                            },
                            id: "i1",
                            layout: "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58",
                            title: "Series 2",
                        },
                        {
                            data: {
                                2: [
                                    64.047312897452, 53.93685241137547, 78.53195036625438,
                                    63.12685058974058, 50.187516638835014, 43.90329745514665,
                                    94.0725396345816, 21.108326963613084, 32.72517345245099, 62.40440012954861],
                            },
                            id: "i2",
                            layout: "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58",
                            title: "Series 3",
                        },
                    ],
                    size: {
                        height: 350,
                        width: 400,
                    },
                    title: {
                        edge: 1,
                        edgePosition: 1,
                        text: "Chart Title",
                    },
                };

                quill.insertEmbed(range.index + 1, "chart", JSON.stringify(chartDef), Quill.sources.USER);
                // quill.formatText(range.index + 1, 1, { height: "170", width: "400" });
                quill.setSelection(range.index + 2, Quill.sources.SILENT);
            });
        });
    }
}
