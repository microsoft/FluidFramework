import "gitgraph.js";
import * as resources from "gitresources";
import * as $ from "jquery";

/*
function displayCommits(element: JQuery, type: string, id: string, versions: resources.ICommit[]) {
    element.append($(`<h2>Document ${id} commits.</h2>`));
    for (let version of versions) {
        const url = `${document.location.origin}/${type}/${id}/commit?version=${version.sha}`;
        element.append($(`<li><a href="${url}" target="_blank">${version.sha}</a></li>`));
    }
}*/

let templateConfig = {
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
           size: 16,
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
        tooltipHTMLFormatter: (commit) => {
            return "" + commit.sha1 + "" + ": " + commit.message;
        },
    },
  };
  let template = new GitGraph.Template(templateConfig);

function generateGraph(type: string, id: string, versions: resources.ICommit[]): void {
    const config: GitGraph.GitGraphOptions = {
        initCommitOffsetX: -20,
        initCommitOffsetY: -10,
        orientation: "horizontal",
        template,
    };
    const graph = new GitGraph(config);

    const master = graph.branch("master");
    let index: number = versions.length;
    for (let version of versions) {
        master.commit({
            dotSize: 20,
            message: "c-" + index,
            onClick: (commit: any) => {
                console.log(commit);
                const url = `${document.location.origin}/${type}/${id}/commit?version=${commit.sha1}`;
                window.open(url, "_blank");
            },
            sha1: version.sha,
            // tag: "tag",
            tooltipDisplay: true,
        });
        --index;
    }
}

export async function load(type: string, id: string, versions: resources.ICommit[]) {
    $("#commitsView").append($(`<h2>Document ${id} commit graph</h2>`));
    generateGraph(type, id, versions);
}
