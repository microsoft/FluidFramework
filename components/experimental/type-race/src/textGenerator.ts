/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
export class TextGenerator {
    public generateText(): string {
        const index = Math.floor(Math.random() * TextGenerator.sampleTexts.length);
        return TextGenerator.sampleTexts[index];
    }

    private static readonly sampleTexts = [
        `This is some sample text to type.`,
        `The quick brown fox jumps over the lazy dog.`,
        `This folder contains a script that will get secret values from the prague keyvault and store them as environment variables. In order to have access to the prague keyvault you must be a member of the prague-secrets or WAC Bohemia security group.`,
        `The loader makes up the minimal kernel of the Fluid runtime. This kernel is responsible for providing access to Fluid storage as well as consensus over a quorum of clients.`,
        `The consensus system allows clients within the collaboration window to agree on document properties. One example of this is the npm package that should be loaded to process operations applied to the document.`,
        `The base document channel is 'owned' and run by the chaincode of the loader. It should be versioned and require a specific loader version.`,
        `Clients within the collaboration window accept the proposal by allowing their reference sequence number to go above the sequence number for the proposal.`,
        `The proposal enters the commit state when the minimum sequence number goes above the sequence number at which it became accepted. In the commit state all subsequent messages are guaranteed to have been sent with knowledge of the proposal.`,
        `You can get the url by looking at the kube endpoints that are available in the -n nuclio namespace`,
    ];
}
