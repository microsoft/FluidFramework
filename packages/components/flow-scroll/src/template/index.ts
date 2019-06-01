import { FlowDocument } from "@chaincode/flow-document";

export async function importDoc(docP: Promise<FlowDocument>, file: string) {
    const response = await fetch(`https://www.wu2.prague.office-int.com/public/literature/${file}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const doc = await docP;

    try {
        // tslint:disable-next-line:no-constant-condition
        while (true) {
            const {done, value} = await reader.read();
            if (done) {
                break;
            }

            const lines = decoder.decode(value).split(/\r?\n/);
            for (const paragraph of lines) {
                // -1 to stay in front of the EOF marker.
                doc.insertText(doc.length - 1, paragraph);
                doc.insertParagraph(doc.length - 1);
            }
        }
    } finally {
        reader.releaseLock();
    }
}
