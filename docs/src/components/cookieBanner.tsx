/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/// <reference types="@wcp/wcp-consent" />
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    WcpConsent?: typeof WcpConsent;
  }
}

const CookieBanner = (): React.ReactElement => {
  const { siteConfig } = useDocusaurusContext();
  const [wcpPackageAvailable, setWcpPackageAvailable] = useState<boolean>(false);
  const MockCookieBanner =  () => {
    return(
      <div id="cookie-banner-test"
        style={{ backgroundColor: "#f1f1f1", padding: "10px", textAlign: "center" }}
      >
       <p>
         This site uses cookies to improve your experience. By continuing to use this
         site, you consent to the use of cookies.
       </p>
       <button onClick={() => alert("Cookies Accepted!")}>Accept</button>
       <button onClick={() => alert("Cookies Declined!")}>Decline</button>
     </div>
    )};

  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("Initializing WcpConsent");

      try {
        let siteConsent: WcpConsent.SiteConsent;
        WcpConsent?.init(
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
        setWcpPackageAvailable(true);
      } catch (error) {
        console.error("Error initializing WcpConsent", error);
      }

    }

  }, [wcpPackageAvailable]);
  return (
    wcpPackageAvailable ?  <div id="cookie-banner"></div> : <MockCookieBanner />

  );
};

export default CookieBanner;
