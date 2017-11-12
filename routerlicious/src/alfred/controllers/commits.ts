import * as resources from "gitresources";
import * as $ from "jquery";

function displayCommits(element: JQuery, type: string, id: string, versions: resources.ICommit[]) {
    element.append($(`<h2>Document ${id} commits.</h2>`));
    for (let version of versions) {
        const url = `${document.location.origin}/${type}/${id}/commit?version=${version.sha}`;
        element.append($(`<li><a href="${url}" target="_blank">${version.sha}</a></li>`));
    }
}

export async function load(type: string, id: string, versions: resources.ICommit[]) {
    displayCommits($("#commitsView"), type, id, versions);
}
