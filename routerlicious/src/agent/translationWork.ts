import * as request from "request";
import { parseString } from "xml2js";
import { core, MergeTree, types } from "../client-api";
import { BaseWork} from "./baseWork";
import { IWork} from "./work";

const subscriptionKey = "bd099a1e38724333b253fcff7523f76a";

async function translate(from: string, to: string, text: string): Promise<string> {
    const params = `from=${from}&to=${to}&text=${encodeURI(text)}&contentType=text/html`;
    const uri = `https://api.microsofttranslator.com/V2/Http.svc/Translate?${params}`;

    return new Promise<string>((resolve, reject) => {
        request(
            {
                headers: {
                    "Ocp-Apim-Subscription-Key" : subscriptionKey,
                },
                method: "GET",
                uri,
            },
            (err, resp, body) => {
                if (err || resp.statusCode !== 200) {
                    reject(err || body);
                } else {
                    parseString(body, (parseErr, result) => {
                        if (parseErr) {
                            reject(parseErr);
                        } else {
                            resolve(result.string._);
                        }
                    });
                }
            });
    });
}

class Translator {
    private language: string;

    constructor(
        private insights: types.IMap,
        private sharedString: MergeTree.SharedString) {
    }

    public async start(): Promise<void> {
        await this.trackTranslation();
        this.sharedString.on("op", (op) => {
            if (!this.language) {
                return;
            }

            // Only translate after the document is actually modified
            const mergeTreeOp = op.contents as MergeTree.IMergeTreeOp;
            if (mergeTreeOp.type === MergeTree.MergeTreeDeltaType.INSERT ||
                mergeTreeOp.type === MergeTree.MergeTreeDeltaType.REMOVE) {

                this.translate().catch((error) => {
                    console.error(error);
                });
            }
        });
    }

    private async trackTranslation(): Promise<void> {
        await this.insights.wait(this.sharedString.id);
        const typeInsights = await this.insights.get(this.sharedString.id) as types.IMap;
        const view = await typeInsights.getView();

        // Get current value
        this.language = view.get("translations");

        // Listen for updates
        typeInsights.on("valueChanged", (params: types.IKeyValueChanged) => {
            if (params.key === "translations") {
                this.language = view.get("translations");
            }
        });
    }

    private async translate(): Promise<void> {
        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");
        const numParagraphs = textAndMarkers.paralellText.length;

        const translationsP: Array<Promise<void>> = [];
        for (let i = 0; i < numParagraphs; i++) {
            const translateP = this.translateParagraph(
                this.sharedString,
                textAndMarkers.paralellText[i],
                textAndMarkers.parallelMarkers[i],
                this.language);
            translationsP.push(translateP);
        }

        await Promise.all(translationsP);
    }

    private async translateParagraph(
        sharedString: MergeTree.SharedString,
        parallelText,
        parallelMarker,
        language: string) {

        const from = "en";
        const translation = parallelText ? await translate(from, language, parallelText) : "";
        const pos = sharedString.client.mergeTree.getOffset(
            parallelMarker, sharedString.client.getCurrentSeq(), sharedString.client.getClientId());
        sharedString.annotateRange({ translation }, pos, pos + 1);
    }
}

export class TranslationWork extends BaseWork implements IWork {
    private translationSet = new Set();
    private translators = new Map<string, core.ICollaborativeObject>();

    constructor(docId: string, config: any, private service: core.IDocumentService) {
        super(docId, config);
    }

    public async start(): Promise<void> {
        await this.loadDocument({ encrypted: undefined, localMinSeq: 0 }, this.service);

        // Wait for the insights
        await this.document.getRoot().wait("insights");
        const insights = await this.document.getRoot().get("insights") as types.IMap;
        this.trackEvents(insights);
    }

    private trackEvents(insights: types.IMap) {
        this.document.on("op", (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (object && object.type === MergeTree.CollaboritiveStringExtension.Type) {
                if (!this.translationSet.has(object)) {
                    this.translationSet.add(object);
                    const translator = new Translator(insights, object as MergeTree.SharedString);
                    this.translators.set(object.id, object);
                    translator.start();
                }
            }
        });
    }
}
