## mltest

A simple test client that invokes our ML service via REST API call. By default it calls our deployed service in azure. To test it locally, run the ml service container first ([instructions here](https://github.com/Microsoft/Prague/blob/master/intelligence/README.md)). Then point the url of the intelligence part to local ip address. Example:

```json
    "intelligence": {
        "nativeTextAnalytics": {
            "url": "http://192.168.0.1:8080/"
        }
    }
```