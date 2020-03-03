/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import * as MergeTree from "@microsoft/fluid-merge-tree";
import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import * as Sequence from "@microsoft/fluid-sequence";
import { translate } from "./translator";

export class SharedStringTranslator {
    private pendingTranslation = false;
    private translating = false;
    // eslint-disable-next-line no-null/no-null
    private translationTimer: NodeJS.Timeout | null = null;
    private typeInsights!: ISharedMap;

    constructor(
        private readonly insights: ISharedMap,
        private readonly sharedString: Sequence.SharedString,
        private readonly apiKey: string) {
    }

    public get isTranslating() {
        return this.translating;
    }

    public async start(): Promise<void> {
        const handle = await this.insights.wait<IComponentHandle<ISharedMap>>(this.sharedString.id);
        this.typeInsights = await handle.get();

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
        // eslint-disable-next-line no-null/no-null
        if (this.translationTimer != null) {
            clearTimeout(this.translationTimer);
        }
    }

    private needsTranslation(op: any): boolean {
        // Exit early if there are no target translations
        const languages = this.typeInsights.get("translationTo");
        if (!languages) {
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
            const annotateOp = mergeTreeOp;
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

            const fromLanguage = this.typeInsights.get("translationFrom");
            const toLanguage = this.typeInsights.get("translationTo");

            // Run translation on all other operations
            this.translating = true;
            const translationsP = this.invokeTranslation([fromLanguage], [toLanguage]);
            const doneP = translationsP.catch((error) => {
                this.translating = false;
                console.error(error);
            });

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            doneP.then(() => {
                this.translating = false;
                console.log(`${start} - ${Date.now()} - Done with translation ${this.sharedString.id}`);
            });
        }, 30);
    }

    private async invokeTranslation(fromLanguages: string[], toLanguages: string[]): Promise<void> {
        // Default to English if no from language is specified.
        if (fromLanguages.length === 0) {
            // eslint-disable-next-line no-param-reassign
            fromLanguages = ["en"];
        }
        // Exit early if no target language is specified
        if (toLanguages.length === 0) {
            return;
        }

        const textAndMarkers = this.sharedString.getTextAndMarkers("pg");
        // tslint:disable-next-line
        for (let i = 0; i < textAndMarkers.parallelMarkers.length; ++i) {
            const pgMarker = textAndMarkers.parallelMarkers[i];
            const pgText = textAndMarkers.parallelText[i];

            // Fetch input paragraph language from marker property.
            const pgProperty = pgMarker.getProperties();
            const languageProperty = "fromLanguage";
            const pgLanguage = pgProperty[languageProperty];
            const fromLanguage = pgLanguage ? pgLanguage : "en";

            const translationOutput = await translate(
                this.apiKey,
                fromLanguage,
                toLanguages,
                [pgText]);

            for (const languageTranslations of translationOutput) {
                const language = languageTranslations[0];
                const translations = languageTranslations[1];
                if (translations.length > 0) {
                    const translation = translations[0];
                    const pos = this.sharedString.getPosition(pgMarker);

                    const props: any = {};
                    props[`translation-${language}`] = translation;
                    this.sharedString.annotateRange(pos, pos + 1, props);
                }
            }
        }
    }
}
