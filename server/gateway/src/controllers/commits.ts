/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
// eslint-disable-next-line import/no-unassigned-import
import "gitgraph.js";
import $ from "jquery";
import { debug } from "./debug";

const templateConfig = {
    arrow: {
        offset: 2.5,
        size: 16,
    },
    branch: {
        color: "#000000",
        lineWidth: 4,
        showLabel: false, // display branch names on graph
        spacingX: 50,
    },
    commit: {
        dot: {
            color: "#f2f2f2",
            size: 40,
            strokeColor: "#000000",
            strokeWidth: 5,
        },
        message: {
            color: "black",
            displayAuthor: false,
            displayBranch: false,
            displayHash: false,
            font: "normal 12pt Arial",
        },
        shouldDisplayTooltipsInCompactMode: true, // default = true
        spacingY: -80,
        tag: {
            font: "normal 12pt Arial",
        },
        tooltipHTMLFormatter: (commit) => {
            return `${commit.sha1}: ${commit.message}`;
        },
    },
};
const template = new GitGraph.Template(templateConfig);

function generateGraph(
    type: string,
    pathPostfix: string,
    tenantId: string,
    id: string,
    versions: resources.ICommitDetails[],
): void {
    const config: GitGraph.GitGraphOptions = {
        initCommitOffsetX: -20,
        initCommitOffsetY: -10,
        orientation: "vertical",
        template,
    };
    const graph = new GitGraph(config);

    const fullId = tenantId
        ? `${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`
        : encodeURIComponent(id);
    const path = pathPostfix ? `${fullId}/${pathPostfix}` : fullId;

    const main = graph.branch("main");
    for (const version of versions) {
        const commitTag = version.commit.message.split(";");
        main.commit({
            dotSize: 20,
            message: commitTag.length >= 1 ? commitTag[0] : "",
            onClick: (commit: any) => {
                debug(commit);
                const url = `${document.location.origin}/${encodeURIComponent(type)}\
                    /${path}?version=${encodeURIComponent(commit.sha1)}`;
                window.open(url, "_blank");
            },
            sha1: version.sha,
            tag: commitTag.length >= 2 ? commitTag[1] : "",
            tooltipDisplay: true,
        });
    }
}

export async function load(
    type: string,
    pathPostfix: string,
    tenantId: string,
    id: string,
    versions: resources.ICommitDetails[]) {
    debug(JSON.stringify(versions));
    // tslint:disable-next-line:no-jquery-raw-elements
    $("#commitsView").append($(`<h2>Document ${id} commit graph</h2>`));
    generateGraph(type, pathPostfix, tenantId, id, versions);
}
