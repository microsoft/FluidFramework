# Prague authentication instruction
This document provides instruction for creating a prague tenant and authenticate to the api using json web token.

## Creating a tenant
The first step is to create a tenant. A tenant is representative of a team/org using Prague API. Navigate to https://admin.wu2.prague.office-int.com/ and add a new tenant with one of the three storage endpoints. Selecting 'github' as a storage endpoint would require more info such as github repository, username, and credential.

Once a tenant is created, click view, copy the **tenant id** and generated **secret key** for the next step.

## Crafting and passing authentication token
Next step is to create a json object, sign it with the generate secret key, and pass to Prague api load call. Prague api verifies the token using the secret key. Once the token is verified, user gets access to the document.

Prague uses [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) library for verifying the token. Below is an example of a token creation:

```javascript
    import * as jwt from "jsonwebtoken";
    const token = jwt.sign(
        {
            documentId: <document_id>, // required
            tenantId: <tenant_id>, // required.
            permission: "read:write", // use "read:write" for now
            user: {
                id: <unique_user_id>, // use oid provided by AAD auth
            },
        }, secret_key);
```

### Passing auth token
To use the token, just add a token field to api load call.
```javascript
prague.api.load(id, { encrypted: false, token: <crafted_token> }).then((document) => {
    // document.getUser() will return an object with verified user information.
}, (error) => {
    // Invalid token error
});
```