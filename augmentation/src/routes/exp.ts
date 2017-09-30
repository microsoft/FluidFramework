import * as request from "request";
import * as helper from "../helper";

const json = helper.constructSpellcheckerInput("startx");
// const json2 = constructSpellcheckerEncoder("startx");

let data: string = "";
for (let params of json.Parameters) {
    if (params.Present) {
        if (data.length > 0)
        {
            data += "&";
        }
        data = data + params.Name + "=" + params.Value;        
    }
}
console.log(data);
// invokeRequest("https://nleditor.osi.office.net/NlEditor/Check/V1/", data);
request.post({url:'https://nleditor.osi.office.net/NlEditor/Check/V1/',
    form: {
        AppId: 'TestApp2',
        RequestId: '{B025D6F9-1C19-4207-A830-264A8CBC8BB1}',
        Text: 'inputx',
        LanguageId: 'en-us',
        RunOnProfileId: '{24BCFF65-03B5-40E9-90C8-59B75ABD453C}',
    }}, function(error, result, body){
    if (error) {
        console.log(`Error: ${error}`);
    }

    if (result.statusCode !== 200) {}
    console.log(body);
});



function invokeRequest(service: string, data: any) {
    request.post(
        service,
        {
            body: data,
            headers: {
                // "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            // json: true,
        },
        (error, result, body) => {
            if (error) {
                console.log(`Error: ${error}`);
            }

            if (result.statusCode !== 200) {
            }
            console.log(body);
        });
}

function constructSpellcheckerEncoder(text) {
    return {
        AppId: "TestApp",
        RequestId: "{B025D6F9-1C19-4207-A830-264A8CBC8BB1}",
        Text: text,
        LanguageId: "en-us",
        RunOnProfileId: "{24BCFF65-03B5-40E9-90C8-59B75ABD453C}"
    };
}