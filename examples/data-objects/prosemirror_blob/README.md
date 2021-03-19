
# @fluid-example/prosemirror-blob

  

An experimental implementation of how to take the open source [ProseMirror](https://prosemirror.net/) rich text editor and

enable real-time coauthoring using the Fluid Framework on uploaded file and connect it with the azure blob storage for storing the data when run on server.

This project is extension of ProseMirror Component which covers the below capabilities:

1. Allow to upload the file and insert it into DDS for collaboration.

2. Allow the content to be synced with **Azure Blob Storage** when Component loaded in the Server(**Using FIS**)

  

## Getting Started

  

If you want to run this example on the client follow the following steps:

  

1. Run `npm install` from the `FluidFramework` root directory

2. Navigate to this directory

3. Run `npm run start`

  

If you want to run it in Docker, follow below step after Step 1, 2 from above:

 - Run `npm run start:docker`


To run it on the **server or using FIS** and support the **upload to azure blob storage** :

 - Change examples/data-objects/prosemirror_blob/storage/storageutils.ts by replacing connection string .
```bash
public storageAccount(webView?: boolean) {
        let sasUrl = undefined;
        if (webView) {
            sasUrl = **https://syncbridge.blob.core.windows.net/samples/pinkscorpion_seer.txt?XXXXXXXXXXXXXXXXXXXXXXXXXXX**
        }
        const azureStorage = new AzureBlobStorage(" **Enter azure blob storage connection String** ", sasUrl);
        return azureStorage;
    }
```

SyncBridge Component is used here to sync data from the component to the azure blob storage. 

## Data model

  

ProseMirror uses the following distributed data structures:

  

- SharedDirectory - root

- SharedString - storing ProseMirror text

  

## Known Issues

  

This implementation stores the HTML output of the ProseMirror editor onto the SharedString. While this enables

collaboration it does not provide for a complete editor. Because rich editing features (ex. bold/italic) are stored

as HTML tags along with the text this can cause conflicts with multiple users applying conflicting styles resulting

in lost opening/closure tags.

  

A more complete solution would use the SharedString property bag to apply styles across text ranges. This allows for

styles to be merged in a more deterministic way.