export function safelyParseJSON(json: string) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
        //
    }
    return parsed;
}
