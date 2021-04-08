export function renderCheckoutView(div: HTMLDivElement): Promise<string[] | undefined> {

    const params = new URLSearchParams(window.location.search);

    const wrapperDiv = document.createElement("div");
    div.append(wrapperDiv);

    const description = document.createElement("p");
    description.innerText = "Do you want to checkout specific paths? Add them now or continue to checkout the whole Property Tree"
    wrapperDiv.append(description);

    let list = document.createElement("ul");

    let submit = document.createElement("button");
    submit.innerHTML = "Submit";

    wrapperDiv.append(list);
    let input = document.createElement("input");
    input.type = "text"
    input.id = "path_input";

    let add = document.createElement("button");
    add.innerHTML = "Add Path";
    add.onclick = () => {
        const text = input.value;
        if (text.length > 0) {
            appendListItem(list, text);
        };
        input.value = "";
    }

    wrapperDiv.append(input,add, submit);

    const promise = new Promise<string[] | undefined>((resolve, reject) => {
        submit.onclick = function () {
            div.removeChild(wrapperDiv);
            const paths = getPaths(list);
            params.set("paths", paths.toString());
            window.history.replaceState({}, "", "?"+ params.toString() + window.location.hash);
            resolve(paths.length > 0 ? paths : undefined);
        };
    });


    if(params.has("paths")){
        const pathString = params.get("paths") || "";
        if(pathString !== ""){
            const paths = pathString.split(",");
            paths.forEach(p => {
                appendListItem(list,p)
            });
        }


    }
    return promise;
}


function getPaths(list: HTMLUListElement): string[] {
    const paths: string[] = [];
    for (let item of list.children) {
        const path = item.getAttribute("path");
        if (path)
            paths.push(path)
    }
    return paths;
}

function appendListItem(list: HTMLUListElement, text: string): void {
    let item = document.createElement("li");
    item.innerText = text;
    item.setAttribute("path", text);

    let button = document.createElement("button");
    button.innerHTML = "-";
    button.onclick = () => { list.removeChild(item); };
    item.append(button);
    list.append(item);
}
