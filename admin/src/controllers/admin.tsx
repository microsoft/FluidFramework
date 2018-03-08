import * as React from "react";
import * as ReactDOM from "react-dom";

import { Content } from "./components/Content";

// TODO: This will come from server.
  const data = {
      tenants: {
          list: [
            {
                key: 0,
                name: "git",
                encryptKey: "secret_key_0",
                storage: "https://git",
            },
            {
                key: 1,
                name: "github",
                encryptKey: "secret_key_1",
                storage: "https://github",
            },
            {
                key: 2,
                name: "sharepoint",
                encryptKey: "secret_key_2",
                storage: "https://sharepoint",
            },
          ]
      },
  };

export async function load(user: any) {
    $("document").ready(() => {
        console.log(user.displayName);
        ReactDOM.render(
            <Content data={data} />,
            document.getElementById("adminportal")
        );
    });
}
