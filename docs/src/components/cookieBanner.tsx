/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect } from "react";

const CookieBanner = () => {
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("Initializing WcpConsent");
      let siteConsent: WcpConsent.SiteConsent;

      WcpConsent && WcpConsent.init(
        "en-US",
        "cookie-banner",
        (err, _siteConsent) => {
          if (err) {
            console.error("WcpConsent initialization error", err);
          } else {
            siteConsent = _siteConsent!;
            console.log("Initial consent", siteConsent.getConsent());
          }
        },
        (newConsent: Record<WcpConsent.consentCategories, boolean>) => {
          console.log("Consent changed", newConsent);
        }
      );
    }
  }, []);

  return <div id="cookie-banner"></div>;
};

export default CookieBanner;
