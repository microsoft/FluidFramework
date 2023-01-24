/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { StringBuilder } from "@rushstack/node-core-library";
import chalk from "chalk";

import { indentString } from "./lib";
import { CommandLogger } from "./logging";

/**
 * An instructional prompt to display to a user in a terminal. A prompt can have any number of sections, and each
 * section is meant to be shown sequentially to provide step-by-step instructions.
 */
export interface InstructionalPrompt {
    /**
     * The title of the prompt.
     */
    title: string;

    /**
     * An array of sections that comprise the prompt.
     */
    sections: Section[];
}

/**
 * A section of an {@link InstructionalPrompt}.
 */
interface Section {
    /**
     * The title of the section.
     */
    title: string;

    /**
     * The instructional message to be displayed in the section.
     */
    message: string;

    /**
     * An optional command string that will be displayed with the instructions.
     */
    cmd?: string;
}

/**
 * Links to ADO pipeline for all release group
 */

export enum ADOPipelineLinks {
    CLIENT = "https://dev.azure.com/fluidframework/internal/_build?definitionId=12",
    SERVER = "https://dev.azure.com/fluidframework/internal/_build?definitionId=30",
    BUILDTOOLS = "https://dev.azure.com/fluidframework/internal/_build?definitionId=14",
    AZURE = "https://dev.azure.com/fluidframework/internal/_build?definitionId=85",
    APIMARKDOWNDOCUMENTER = "https://dev.azure.com/fluidframework/internal/_build?definitionId=97",
    BENCHMARK = "https://dev.azure.com/fluidframework/internal/_build?definitionId=96",
    TESTTOOLS = "https://dev.azure.com/fluidframework/internal/_build?definitionId=13",
    TINYLICIOUS = "https://dev.azure.com/fluidframework/internal/_build?definitionId=22",
    BUILDCOMMON = "https://dev.azure.com/fluidframework/internal/_build?definitionId=3",
    ESLINTCONFLIGFLUID = "https://dev.azure.com/fluidframework/internal/_build?definitionId=7",
    COMMONDEFINITIONS = "https://dev.azure.com/fluidframework/internal/_build?definitionId=8",
    COMMONUTILS = "https://dev.azure.com/fluidframework/internal/_build?definitionId=10",
    PROTOCOLDEFINITIONS = "https://dev.azure.com/fluidframework/internal/_build?definitionId=67",
}

/**
 *
 * Returns ADO pipeline link for the releaseGroup
 */
export const mapADOLinks = (releaseGroup: string | undefined): string => {
    const adoLink = releaseGroup === "client"
            ? ADOPipelineLinks.CLIENT
            : releaseGroup === "server"
            ? ADOPipelineLinks.SERVER
            : releaseGroup === "azure"
            ? ADOPipelineLinks.AZURE
            : releaseGroup === "build-tools"
            ? ADOPipelineLinks.BUILDTOOLS
            : releaseGroup === "@fluid-tools/api-markdown-documenter"
            ? ADOPipelineLinks.APIMARKDOWNDOCUMENTER
            : releaseGroup ===  "@fluid-tools/benchmark"
            ? ADOPipelineLinks.BENCHMARK
            : releaseGroup === "@fluidframework/test-tools"
            ? ADOPipelineLinks.TESTTOOLS
            : releaseGroup === "tinylicious"
            ? ADOPipelineLinks.TINYLICIOUS
            : releaseGroup === "@fluidframework/build-common"
            ? ADOPipelineLinks.BUILDCOMMON
            : releaseGroup === "@fluidframework/eslint-config-fluid"
            ? ADOPipelineLinks.ESLINTCONFLIGFLUID
            : releaseGroup === "@fluidframework/common-definitions"
            ? ADOPipelineLinks.COMMONDEFINITIONS
            : releaseGroup === "@fluidframework/common-utils"
            ? ADOPipelineLinks.COMMONUTILS
            : ADOPipelineLinks.PROTOCOLDEFINITIONS;
    return adoLink;
}

/**
 * An abstract base class for classes that write {@link InstructionalPrompt}s to the terminal.
 */
export abstract class InstructionalPromptWriter {
    protected abstract get log(): CommandLogger;

    public async formatPrompt(data: InstructionalPrompt): Promise<string> {
        const b = new StringBuilder();

        b.append(chalk.green(chalk.underline(data.title)));
        b.append("\n");
        b.append("\n");

        for (const section of data.sections) {
            b.append(chalk.white(chalk.underline(`${section.title}:`)));
            b.append("\n");
            b.append("\n");
            b.append(indentString(section.message, 4));
            b.append("\n");
            b.append("\n");
            if (section.cmd !== undefined) {
                b.append(indentString(chalk.cyan(`${section.cmd}`), 4));
                b.append("\n");
                b.append("\n");
            }
        }

        return b.toString();
    }

    /**
     * Writes the prompt to the terminal.
     */
    public async writePrompt(data: InstructionalPrompt) {
        const prompt = await this.formatPrompt(data);

        this.log.logHr();
        this.log.log("");
        this.log.log(prompt);
    }
}

/**
 * A simple concrete implementation of {@link InstructionalPromptWriter}.
 */
export class PromptWriter extends InstructionalPromptWriter {
    public constructor(public log: CommandLogger) {
        super();
    }
}
