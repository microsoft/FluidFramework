# Prague authentication instruction
This document provides instruction for creating a prague tenant and authenticate to the api using json web token.

## Creating a tenant
The first step is to create a tenant. A tenant is representative of a team/org using Prague API. Navigate to https://admin.wu2.prague.office-int.com/ and add a new tenant with an unique name and one of the three storage endpoints. Selecting 'github' as a storage endpoint would require more info such as github repository, username, and credential.

Once a tenant is created, copy the tenant name and generated secret key for the next step.

## Crafting and passing authentication token
Next step is to craft a token for prague api load call. Prague api decodes the passed token using a common symmetric key shared with all tenants (for now just use "symmetric_key") and verifies the provided <tenantid> and <secret>. Once the token is verified, user gets access to the document.

Prague uses [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) library for verifying the token. Teannts are also required to use the same library. Below is an example of a token creation:

```javascript
    import * as jwt from "jsonwebtoken";
    const token = jwt.sign(
        {
            tenantid: <tenant_id>, // required
            secret: <generated_secret_key>, // required.
            permission: "read:write", // optional.
            user: {
                    name: username, // required
                    id: email_address, // optional
                    data: {}, // optinoal
            },
        },
        "symmetric_key");
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

## Creating a tenant
We require each tenant to use the following https api endpoints. http endpoints will be deprecated soon.
Delta endpoint: https://alfred.wu2.prague.office-int.com
Storage endpoint: https://historian.wu2.prague.office-int.com