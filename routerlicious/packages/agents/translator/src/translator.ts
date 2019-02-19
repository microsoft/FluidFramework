import { ISequencedDocumentMessage } from "@prague/container-definitions";
import * as map from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
import * as request from "request";

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

export class Translator {
    private pendingTranslation = false;
    private translating = false;
    private translationTimer = null;
    private typeInsights: map.ISharedMap;

    constructor(
        private insights: map.ISharedMap,
        private sharedString: Sequence.SharedString) {
        }

    public get isTranslating() {
        return this.translating;
    }

    public async start(): Promise<void> {
        await this.insights.wait(this.sharedString.id);
        this.typeInsights = this.insights.get(this.sharedString.id) as map.ISharedMap;

        this.sharedString.on("op", (op: ISequencedDocumentMessage) => {
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
        const languages = this.typeInsights.get("translations") as map.DistributedSet<string>;
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

    private requestTranslation(op: ISequencedDocumentMessage): void {
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

            const languages = this.typeInsights.get("translations") as map.DistributedSet<string>;

            // Run translation on all other operations
            this.translating = true;
            const translationsP = this.translate(languages.entries());
            const doneP = translationsP.catch((error) => {
                this.translating = false;
                console.error(error);
            });

            doneP.then(() => {
                this.translating = false;
                console.log(`${start} - ${Date.now()} - Done with translation ${this.sharedString.id}`);
            });
        }, 30);
    }

    private async translate(languages: string[]): Promise<void> {
        const from = "en";

        const textAndMarkers = this.sharedString.client.getTextAndMarkers("pg");

        const rawTranslations = await translate(from, languages, textAndMarkers.parallelText);
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
