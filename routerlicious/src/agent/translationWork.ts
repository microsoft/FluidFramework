import * as request from "request";
import { Builder, parseString } from "xml2js";
import { core, map, MergeTree, types } from "../client-api";
import { CollaborativeStringExtension, SharedString } from "../shared-string";
import { BaseWork} from "./baseWork";
import { IWork} from "./work";

const subscriptionKey = "bd099a1e38724333b253fcff7523f76a";

function createRequestBody(from: string, to: string, texts: string[]): string {
    const builder = new Builder({ rootName: "TranslateArrayRequest", headless: true });

    const object = {
        AppId: "",
        From: from,
        Options: {
            ContentType: "text/xml",
        },
        Texts: {
            string: texts,
        },
        To: to,
    };

    return builder.buildObject(object);
}

async function translate(from: string, to: string, text: string[]): Promise<string[]> {
    const uri = `https://api.microsofttranslator.com/V2/Http.svc/TranslateArray`;

    const requestBody = createRequestBody(from, to, text).replace(
        /<string>/g,
        "<string xmlns=\"http://schemas.microsoft.com/2003/10/Serialization/Arrays\">");

    return new Promise<string[]>((resolve, reject) => {
        request(
            {
                body: requestBody,
                headers: {
                    "Content-Type": "text/xml",
                    "Ocp-Apim-Subscription-Key" : subscriptionKey,
                },
                method: "POST",
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
                            const translations = result.ArrayOfTranslateArrayResponse.TranslateArrayResponse.map(
                                (value) => value.TranslatedText[0]);
                            resolve(translations);
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
        private sharedString: SharedString) {
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

        const start = Date.now();
        console.log(`${start} - Requesting translation ${this.sharedString.id}`);

        // Begin the translation
        this.pendingTranslation = true;

        // Set a timeout before we perform the translation to collect any extra inbound ops
        setTimeout(() => {
            // Let new reqeusts start
            this.pendingTranslation = false;

            const languages = this.view.get("translations") as map.DistributedSet<string>;

            // Run translation on all other operations
            const translationsP = Promise.all(languages.entries().map((language) => this.translate(language)));
            const doneP = translationsP.catch((error) => {
                console.error(error);
            });

            doneP.then(() => {
                console.log(`${start} - ${Date.now()} - Done with translation ${this.sharedString.id}`);
            });
        }, 30);
    }

    private async translate(language: string): Promise<void> {
        const from = "en";

        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");

        const translations = await translate(from, language, textAndMarkers.paralellText);
        for (let i = 0; i < translations.length; i++) {
            const translation = translations[i];

            const pos = this.sharedString.client.mergeTree.getOffset(
                textAndMarkers.parallelMarkers[i],
                this.sharedString.client.getCurrentSeq(),
                this.sharedString.client.getClientId());

            const props: any = {};
            props[`translation-${language}`] = translation;
            this.sharedString.annotateRange(props, pos, pos + 1);
        }
    }
}

export class TranslationWork extends BaseWork implements IWork {
    private translationSet = new Set();
    private translators = new Map<string, core.ICollaborativeObject>();

    constructor(docId: string, private token: string, config: any, private service: core.IDocumentService) {
        super(docId, config);
    }

    public async start(): Promise<void> {
        await this.loadDocument({ encrypted: undefined, localMinSeq: 0, token: this.token }, this.service);

        // Wait for the insights
        await this.document.getRoot().wait("insights");
        const insights = await this.document.getRoot().get("insights") as types.IMap;
        return this.trackEvents(insights);
    }

    private trackEvents(insights: types.IMap): Promise<void> {
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (object && object.type === CollaborativeStringExtension.Type) {
                if (!this.translationSet.has(object)) {
                    this.translationSet.add(object);
                    const translator = new Translator(insights, object as SharedString);
                    this.translators.set(object.id, object);
                    translator.start();
                }
            }
        };
        this.operation = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }
}
