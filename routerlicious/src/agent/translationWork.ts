import * as request from "request";
import { parseString } from "xml2js";
import { core, map, MergeTree, types } from "../client-api";
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
    private view: types.IMapView;
    private pendingTranslation: any;

    constructor(
        private insights: types.IMap,
        private sharedString: MergeTree.SharedString) {
    }

    public async start(): Promise<void> {
        await this.insights.wait(this.sharedString.id);
        const typeInsights = await this.insights.get(this.sharedString.id) as types.IMap;
        this.view = await typeInsights.getView();

        this.sharedString.on("op", (op: core.ISequencedObjectMessage) => {
            if (this.needsTranslation(op)) {
                this.requestTranslation(op);
            }
        });
    }

    private needsTranslation(op: any): boolean {
        // Exit early if there are no target translations
        const languages = this.view.get("translations") as map.DistributedSet<string>;
        if (!languages || languages.entries().length === 0) {
            return false;
        }

        // The operation must be an insert, remove or annotate
        const mergeTreeOp = op.contents as MergeTree.IMergeTreeOp;
        if (mergeTreeOp.type !== MergeTree.MergeTreeDeltaType.INSERT &&
            mergeTreeOp.type !== MergeTree.MergeTreeDeltaType.REMOVE &&
            mergeTreeOp.type !== MergeTree.MergeTreeDeltaType.ANNOTATE) {
            return false;
        }

        // If an annotation it must be a style property change
        if (mergeTreeOp.type === MergeTree.MergeTreeDeltaType.ANNOTATE) {
            const annotateOp = mergeTreeOp as MergeTree.IMergeTreeAnnotateMsg;
            if (Object.keys(annotateOp.props).findIndex(
                (key) => key === "font-weight" || key === "text-decoration") === -1) {
                return false;
            }
        }

        return true;
    }

    private requestTranslation(op: core.ISequencedObjectMessage): void {
        // Exit early if there is a translation in progress but make not of the desired request
        if (this.pendingTranslation) {
            return;
        }

        console.log(`${Date.now()} - Requesting translation ${this.sharedString.id}`);

        // Begin the translation
        this.pendingTranslation = true;

        // Set a timeout before we perform the translation to collect any extra inbound ops
        setTimeout(() => {
            // Let new reqeusts start
            this.pendingTranslation = false;

            const languages = this.view.get("translations") as map.DistributedSet<string>;

            // Run translation on all other operations
            const translationsP = Promise.all(languages.entries().map((language) => this.translate(language)));
            translationsP.catch((error) => {
                console.error(error);
            });
        }, 30);
    }

    private async translate(language: string): Promise<void> {
        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");
        const numParagraphs = textAndMarkers.paralellText.length;

        const translationsP: Array<Promise<void>> = [];
        for (let i = 0; i < numParagraphs; i++) {
            const translateP = this.translateParagraph(
                this.sharedString,
                textAndMarkers.paralellText[i],
                textAndMarkers.parallelMarkers[i],
                language);
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

        const annotation = {};
        annotation[`translation-${language}`] = translation;

        sharedString.annotateRange(annotation, pos, pos + 1);
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
