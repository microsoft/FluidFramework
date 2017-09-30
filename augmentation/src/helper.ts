/**
 * Extracts JSON portion of a string and returns as a JSON.
 */
export function extractJSON(str: string) {
    let firstOpen: number;
    let firstClose: number;
    let candidate: string;
    firstOpen = str.indexOf("{", firstOpen + 1);
    do {
        firstClose = str.lastIndexOf("}");
        if (firstClose <= firstOpen) {
            return null;
        }
        do {
            candidate = str.substring(firstOpen, firstClose + 1);
            try {
                let res = JSON.parse(candidate);
                return res;
            } catch (e) {
                console.log(`Failed parsing response JSON.`);
            }
            firstClose = str.substr(0, firstClose).lastIndexOf("}");
        } while (firstClose > firstOpen);
        firstOpen = str.indexOf("{", firstOpen + 1);
    } while (firstOpen !== -1);
}

export function constructSpellcheckerEncoder(text: string) {
    return {
        AppId: "TestApp",
        RequestId: "{B025D6F9-1C19-4207-A830-264A8CBC8BB1}",
        Text: text,
        LanguageId: "en-us",
        RunOnProfileId: "{24BCFF65-03B5-40E9-90C8-59B75ABD453C}"
    };
}

/**
 * Given a string, constructs a JSON that spellchecker service understands.
 */
export function constructSpellcheckerInput(text: string) {
    return {
        Parameters: [
            {
                Name: "AppId",
                Present: "true",
                Value: "TestApp",
            },
            {
                Name: "AppVersion",
                Present: "false",
                Value: "1.0.0.0",
            },
            {
                Name: "RequestId",
                Present: "true",
                Value: "{B025D6F9-1C19-4207-A830-264A8CBC8BB1}",
            },
            {
                Name: "Text",
                Present: "true",
                Value: text,
            },
            {
                Name: "Start",
                Present: "false",
                Value: "0",
            },
            {
                Name: "Length",
                Present: "false",
                Value: text.length,
            },
            {
                Name: "LanguageId",
                Present: "true",
                Value: "en-us",
            },
            {
                Name: "LanguageUxId",
                Present: "false",
                Value: "en-us",
            },
            {
                Name: "RunOnProfileId",
                Present: "true",
                Value: "{24BCFF65-03B5-40E9-90C8-59B75ABD453C}",
            },
            {
                Name: "RunOnProfileGenerationId",
                Present: "false",
                Value: "0",
            },
        ],
    };
}
