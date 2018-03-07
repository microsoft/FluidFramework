import * as React from "react";
import * as ReactDOM from "react-dom";

import { Content } from "./components/Content";

// TODO: This will come from server.
  const data = {
      tenants: {
          list: [
            {
                id: "git",
                key: "secret_key",
                storage: "https://git",
            },
            {
              id: "github",
              key: "secret_key_2",
              storage: "https://github",
            },
            {
              id: "sharepoint",
              key: "secret_key_3",
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
