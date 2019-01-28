import * as core from "@prague/api-definitions";
import * as map from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
// tslint:disable-next-line:max-line-length
import { IDocumentService, ISequencedDocumentMessage, ISequencedObjectMessage, ITokenProvider, IUser } from "@prague/runtime-definitions";
import * as Sequence from "@prague/sequence";
import { EventEmitter } from "events";
import * as request from "request";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";
import { runAfterWait } from "./utils";

interface ITranslatorInput {
    Text: string;
}

interface ITranslatorOutputUnit {
    text: string;
    to: string;
}

interface ITranslatorOutput {
    translations: ITranslatorOutputUnit[];
}

const subscriptionKey = "bd099a1e38724333b253fcff7523f76a";

function createRequestUri(from: string, to: string[]): string {
    const uri = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0`;
    const fromLanguage = `&from=${from}&to=`;
    const toLanguages = to.join(`&to=`);
    return uri.concat(fromLanguage, toLanguages);
}

function createRequestBody(texts: string[]): ITranslatorInput[] {
    return texts.map((text: string) => {
        const input: ITranslatorInput = {Text: text};
        return input;
    });
}

function processTranslationOutput(input: ITranslatorOutput[]): Map<string, string[]> {
    const languageText = new Map<string, string[]>();
    for (const unit of input) {
        for (const translation of unit.translations) {
            if (!languageText.has(translation.to)) {
                languageText.set(translation.to, []);
            }
            languageText.get(translation.to).push(translation.text);
        }
    }
    return languageText;
}

async function translate(from: string, to: string[], text: string[]): Promise<ITranslatorOutput[]> {
    const uri = createRequestUri(from, to);

    const requestBody = createRequestBody(text);

    return new Promise<ITranslatorOutput[]>((resolve, reject) => {
        request(
            {
                body: requestBody,
                headers: {
                    "Content-Type": "application/json",
                    "Ocp-Apim-Subscription-Key" : subscriptionKey,
                },
                json: true,
                method: "POST",
                uri,
            },
            (err, resp, body) => {
                if (err || resp.statusCode !== 200) {
                    reject(err || body);
                } else {
                    resolve(body as ITranslatorOutput[]);
                }
            });
    });
}

class Translator extends EventEmitter {
    private view: map.IMapView;
    private pendingTranslation = false;
    private translating = false;
    private translationTimer = null;

    constructor(
        private insights: map.IMap,
        private sharedString: Sequence.SharedString) {
            super();
    }

    public get isTranslating() {
        return this.translating;
    }

    public async start(): Promise<void> {
        await this.insights.wait(this.sharedString.id);
        const typeInsights = await this.insights.get(this.sharedString.id) as map.IMap;
        this.view = await typeInsights.getView();

        this.sharedString.on("op", (op: ISequencedObjectMessage) => {
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

    private requestTranslation(op: ISequencedObjectMessage): void {
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
            const translationsP = this.translate(languages.entries());
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

    private async translate(languages: string[]): Promise<void> {
        const from = "en";

        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");

        const rawTranslations = await translate(from, languages, textAndMarkers.paralellText);
        const processedTranslations = processTranslationOutput(rawTranslations);

        for (const languageTranslations of processedTranslations) {
            const language = languageTranslations[0];
            const translations = languageTranslations[1];
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
}

export class TranslationWork extends BaseWork implements IWork {
    private translationSet = new Set();
    private translators = new Map<string, core.ICollaborativeObject>();
    private translator: Translator;

    constructor(
        docId: string,
        tenantId: string,
        user: IUser,
        tokenProvider: ITokenProvider,
        config: any,
        private service: IDocumentService) {
        super(docId, tenantId, user, tokenProvider, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { encrypted: undefined, localMinSeq: 0, client: { type: "translation"} },
            this.service,
            task);

        // Wait for the insights
        await this.document.getRoot().wait("insights");
        const insights = await this.document.getRoot().get("insights") as map.IMap;
        return this.trackEvents(insights);
    }

    public async stop(): Promise<void> {
        if (this.translator) {
            await runAfterWait(
                this.translator.isTranslating,
                this.translator,
                "translated",
                async () => {
                    this.translator.stop();
                });
        }
        await super.stop();
    }

    private trackEvents(insights: map.IMap): Promise<void> {
        const eventHandler = (op: ISequencedDocumentMessage, object: core.ICollaborativeObject) => {
            if (object && object.type === Sequence.CollaborativeStringExtension.Type) {
                if (!this.translationSet.has(object)) {
                    this.translationSet.add(object);
                    this.translator = new Translator(insights, object as Sequence.SharedString);
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
