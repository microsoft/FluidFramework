import * as storage from "./storage";

/**
 * A document is a collection of collaborative types. The API provides access to the root document as well as the
 * ability to append new collaborative objects to the document
 */
export class Document {
    /**
     * Constructs a new document from the provided details
     */
    constructor(private details: storage.IDocumentDetails) {
        // register for changes to the document
        this.details.document.on(storage.DocumentEvents.Update, (delta) => this.update(delta));
    }

    private update(delta: any) {
        console.log(`Document updated ${JSON.stringify(delta)}`);
    }
}

export async function load(source: storage.IStorage, name: string): Promise<Document> {
    const details = await source.load(name);
    return new Document(details);
}
