export function getQueryString(queryParams: { [key: string]: string }): string {
    let queryString = "";
    for (const key of Object.keys(queryParams)) {
        const startChar = queryString === "" ? "?" : "&";
        queryString += queryParams[key] ? `${startChar}${key}=${encodeURIComponent(queryParams[key])}` : "";
    }

    return queryString;
}
