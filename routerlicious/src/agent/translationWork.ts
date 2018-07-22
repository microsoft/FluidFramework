import { EventEmitter } from "events";
import * as request from "request";
import { Builder, parseString } from "xml2js";
import { core, map, MergeTree, types } from "../client-api";
import { CollaborativeStringExtension, SharedString } from "../shared-string";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";
import { runAfterWait } from "./utils";

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

class Translator extends EventEmitter {
    private view: types.IMapView;
    private pendingTranslation = false;
    private translating = false;
    private translationTimer = null;

    constructor(
        private insights: types.IMap,
        private sharedString: SharedString) {
            super();
    }

    public get isTranslating() {
        return this.translating;
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

    public stop() {
        // Remove listener to stop inbound ops first.
        this.sharedString.removeAllListeners();
        // Cancel timer to stop invoking further translation.
        clearTimeout(this.translationTimer);
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
        this.translationTimer = setTimeout(() => {
            // Let new reqeusts start
            this.pendingTranslation = false;

            const languages = this.view.get("translations") as map.DistributedSet<string>;

            // Run translation on all other operations
            this.translating = true;
            const translationsP = Promise.all(languages.entries().map((language) => this.translate(language)));
            const doneP = translationsP.catch((error) => {
                this.translating = false;
                console.error(error);
                this.emit("translated");
            });

            doneP.then(() => {
                this.translating = false;
                console.log(`${start} - ${Date.now()} - Done with translation ${this.sharedString.id}`);
                this.emit("translated");
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
    private translator: Translator;

    constructor(docId: string, private token: string, config: any, private service: core.IDocumentService) {
        super(docId, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, localMinSeq: 0, token: this.token, client: { type: "translation"} },
            this.service,
            task);

        // Wait for the insights
        await this.document.getRoot().wait("insights");
        const insights = await this.document.getRoot().get("insights") as types.IMap;
        return this.trackEvents(insights);
    }

    public async stop(task: string): Promise<void> {
        if (this.translator) {
            await runAfterWait(
                this.translator.isTranslating,
                this.translator,
                "translated",
                async () => {
                    this.translator.stop();
                });
        }
        await super.stop(task);
    }

    private trackEvents(insights: types.IMap): Promise<void> {
        const eventHandler = (op: core.ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (object && object.type === CollaborativeStringExtension.Type) {
                if (!this.translationSet.has(object)) {
                    this.translationSet.add(object);
                    this.translator = new Translator(insights, object as SharedString);
                    this.translators.set(object.id, object);
                    this.translator.start();
                }
            }
        };
        this.opHandler = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }
}
