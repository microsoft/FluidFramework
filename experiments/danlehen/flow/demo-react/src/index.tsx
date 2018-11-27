import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Store } from "../../../../../routerlicious/packages/store";
import { FlowDocument } from "../../document";
import { e, Editor, Scheduler } from "../../editor";
import App from './App';
import './index.css';
import registerServiceWorker from './registerServiceWorker';

const root = document.getElementById('root') as HTMLElement;
const reactRoot = e({ tag: 'div' });
const scheduler = new Scheduler();

const open = async (docId: string) => {
    const store = new Store("http://localhost:3000");
    const doc = await store.open<FlowDocument>(docId, "danlehen", "@chaincode/flow-document@latest");

    const lorum = "Maecenas elementum dui sed lorem dignissim suscipit. Duis lacinia, leo vel luctus mattis, felis enim pharetra metus, sed congue lacus felis non est. Vivamus at nulla vel ligula ornare interdum non lacinia velit. Sed porta congue luctus. Morbi sed nunc ac mauris commodo ultricies eu vel neque. Ut est urna, dapibus congue neque ut, ullamcorper pulvinar augue. Nullam cursus eleifend enim vitae fermentum. Duis in ante leo. Mauris in libero et ipsum ultricies tincidunt at vel erat. Sed id ipsum eget augue iaculis dictum a eget purus. Vestibulum a dui accumsan lacus viverra sollicitudin ac vitae urna. Pellentesque aliquet nibh nec iaculis laoreet."

    for (let i = 0; i < 3; i++) {
        doc.insertParagraph(doc.length);
        const str = lorum;
        // str = lorum.replace(/\w/g, `${i}`);
        doc.appendText(str);
    }

    return doc;
}

const makeFlow = async (docId: string, className = "") => {
    const textDoc = await open(docId);
    const editor = new Editor(scheduler, textDoc);
    
    // tslint:disable:object-literal-sort-keys
    return {
        root: e({
            tag: "span",
            children: [
                { tag: "span", props: { textContent: "Before FlowView →" }},
                { tag: "span", props: { className }, children: [ editor.root ]},
                { tag: "span", props: { textContent: "← After FlowView" }},
            ]
        }),
        textDoc
    };
}

const run = async () => {
    const exclusion = e({ tag: "div", props: { className: "exclusion" }});

    const fv1 = await makeFlow(Math.random().toString(36).substr(2, 4));
    // const fv2 = await makeFlow(Math.random().toString(36).substr(2, 4), styles.flowViewInclusion);

    fv1.textDoc.insertText(300, "← INCLUSION ");
    // fv1.textDoc.insertInclusion(300, fv2.root);
    fv1.textDoc.insertInclusion(300, reactRoot);
    fv1.textDoc.insertText(300, " INCLUSION →");

    // fv2.textDoc.insertText(400, "← INCLUSION ");
    // fv2.textDoc.insertInclusion(400, e({ tag: "img", props: { className: styles.inclusion, src: "http://www.computermuseum.it/images/computer/135.jpg" }}));
    // fv2.textDoc.insertText(400, " INCLUSION →");

    root.appendChild(e({ tag: "div", props: {  }, children: [ exclusion, fv1.root ]}));
};

run();

ReactDOM.render(<App />, reactRoot);
registerServiceWorker();
