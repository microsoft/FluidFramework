Hooking up API with auth
    Changes in ExampleAPI.ts:
        - Change apiBaseUri to your api endpoint
        - Check oauth1 section and config/environment variables for authentication

    Changes in custom-environment-variables.json
        - Check for environment variable maps to config variables
    
    Changes in launch.json
        - Setup necessary environment variables to be mapped to config variables in custom-environment-variables.json

    Changes in desired dialog
        - Call necessary funtions to make api call, e.g.:
            let api = exampleAPI.Utils.createExampleAPI(session, null);
            let body = await api.getAsync("/url/ending/for/call", {q: "name", result_type: "recent", count: "5"});
            session.send(JSON.stringify(body.text));

Setting up Bot to run in Teams or with a registered bot id/password
    - Register your Bot and its endpoint with the botframework: https://dev.botframework.com/
    - Add your app ID and password into the launch.json file to set these as environment variables
    - Uncomment the config import in app.ts
    - Change app.ts to use the config variables for appId and appPassword for the connector instead of being set to ""

Using Natural Language processing with LUIS
    - Receive a LUIS endpoint: https://www.luis.ai/home/index
    - Add the LUIS endpoint to the launch.json file for the environment variable, LUIS_ENDPOINT_URI
    - Uncomment the config import in RootDialog.ts
    - Uncomment the section of code for adding a new LuisRecognizer to the RootDialog:
        let luisEndpoint = config.get("luis.endpointUri");
        if (luisEndpoint) {
            this.recognizer(new builder.LuisRecognizer(luisEndpoint));
        }

************************** Updated:
To delete "template" examples:
    delete examples directory from src/dialogs
    delete matches and intentes between ******** in src/utils/DialogMatches
    delete strings between ******** in src/locale/en/index.json
    delete dialog ids between ****** in DialogIds in src/utils/DialogUtils
    In src/dialogs/RootDialog.ts
        delete imports between *********
        delete instantiations of dialogs between ******** in register method











    
    
    