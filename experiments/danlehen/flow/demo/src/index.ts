import { Store } from "../../../../../routerlicious/packages/store";
import { FlowDocument } from "../../document";
import { Editor, Scheduler, e } from "../../editor";
import * as styles from "./index.css";

const scheduler = new Scheduler();

const buildTestParagraph = (doc: FlowDocument) => {
    for (let j = 0; j < 11; j++) {
        if (j !== 0) {
            doc.insertParagraph(doc.length);
        }
        for (let i = 0; i < 10; i++) {
            doc.appendText(`(${i})`);
        }
    }
}

const buildLorumIpsum = (doc: FlowDocument, numParagraphs: number, paragraphLength?: number) => {
    const lorum = "Maecenas elementum dui sed lorem dignissim suscipit. Duis lacinia, leo vel luctus mattis, felis enim pharetra metus, sed congue lacus felis non est. Vivamus at nulla vel ligula ornare interdum non lacinia velit. Sed porta congue luctus. Morbi sed nunc ac mauris commodo ultricies eu vel neque. Ut est urna, dapibus congue neque ut, ullamcorper pulvinar augue. Nullam cursus eleifend enim vitae fermentum. Duis in ante leo. Mauris in libero et ipsum ultricies tincidunt at vel erat. Sed id ipsum eget augue iaculis dictum a eget purus. Vestibulum a dui accumsan lacus viverra sollicitudin ac vitae urna. Pellentesque aliquet nibh nec iaculis laoreet."
        .slice(0, paragraphLength);

    for (let i = 0; i < numParagraphs; i++) {
        if (i !== 0) {
            doc.insertParagraph(doc.length);
        }
        
        let str = lorum;
        //str = lorum.replace(/\w/g, `${i}`);
        doc.appendText(str);
    }
}

const addInclusion = (textDoc: FlowDocument, root: HTMLElement, position: number) => {
    textDoc.insertText(position, "← INCLUSION ");
    textDoc.insertInclusion(position, root);
    textDoc.insertText(position, " INCLUSION →");
}

const open = async (docId: string) => {
    const store = new Store("http://localhost:3000");
    const doc = await store.open<FlowDocument>(docId, "danlehen", "@chaincode/flow-document@latest");

    //buildLorumIpsum(doc, 3);
    //addInclusion(doc, e({ tag: "img", props: { className: styles.includeLeft, src: "http://www.computermuseum.it/images/computer/135.jpg" }}), 300);
    buildTestParagraph(doc);

    return doc;
}

const makeFlow = async (docId: string) => {
    const textDoc = await open(docId);
    const editor = new Editor(scheduler, textDoc);
    return {
        textDoc,
        root: editor.root
    };
}

const run = async () => {
    const { root } = await makeFlow(Math.random().toString(36).substr(2, 4));

    // textDoc.insertText(300, "← INCLUSION ");
    // const fv2 = await makeFlow(Math.random().toString(36).substr(2, 4));
    // textDoc.insertInclusion(300, fv2.root as HTMLElement);
    // textDoc.insertText(300, " INCLUSION →");

    // fv1.textDoc.insertText(300, "← INCLUSION ");
    // fv1.textDoc.insertInclusion(300, e({ tag: "img", props: { className: styles.includeLeft, src: "http://www.computermuseum.it/images/computer/135.jpg" }}));
    // fv1.textDoc.insertText(300, " INCLUSION →");

    // fv1.textDoc.insertText(1100, "← INCLUSION ");
    // fv1.textDoc.insertInclusion(1100, e({ tag: "video", props: { className: styles.includeRight, autoPlay: true, loop: true, controls: "controls", src: "https://www.tutorialrepublic.com//examples/video/shuttle.mp4" }}));
    // fv1.textDoc.insertText(1100, " INCLUSION →");

    document.body.appendChild(e({
        tag: "div",
        props: { className: styles.editor },
        children: [ root ]
    }));
};

run();