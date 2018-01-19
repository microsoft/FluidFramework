async function bucketExists(minioClient, bucket: string) {
    return new Promise<boolean>((resolve, reject) => {
        minioClient.bucketExists(bucket, (error) => {
            if (error && error.code !== "NoSuchBucket") {
                reject(error);
            } else {
                resolve(error ? false : true);
            }
        });
    });
}

async function makeBucket(minioClient, bucket: string) {
    return new Promise<void>((resolve, reject) => {
        minioClient.makeBucket(bucket, "us-east-1", (error) => {
            if (error) {
                return reject(error);
            } else {
                return resolve();
            }
        });
    });
}

export async function getOrCreateMinioBucket(minioClient, bucket: string) {
    const exists = await bucketExists(minioClient, bucket);
    if (!exists) {
        return await makeBucket(minioClient, bucket);
    }
}
