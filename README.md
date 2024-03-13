# Enhanced Cache Action: vi-technologies/cache@v4

Welcome to the improved cache action, `vi-technologies/cache@v4`, a fork from the original `actions/cache@v4`. This README explains the necessity for this fork, its benefits, and how it differs from the original.

## Why the Fork?

The original GitHub cache action, while useful, had a significant limitation—its usage was constrained to the same branch or reference. This limitation made it less effective, particularly in scenarios involving multiple branches or workflows that could benefit from shared caching mechanisms. 

Recognizing the need for greater flexibility, we introduced `vi-technologies/cache@v4`. This version leverages AWS S3 to store cache, breaking free from the constraints of branch or ref-specific usage. Now, workflows across different branches can utilize a shared cache, enhancing speed and efficiency across the board.

## Benefits of vi-technologies/cache@v4

- **Cross-branch caching**: Unlike the original, our fork allows cached data to be shared and accessed across different branches, facilitating smoother and faster workflows.
- **AWS S3 Integration**: By utilizing AWS S3 for cache storage, we ensure higher reliability and speed, thanks to S3's robust infrastructure.
- **Enhanced flexibility**: Removing the branch/ref constraint means our caching solution offers more adaptability to various workflow requirements.

## How to Use

To switch to `vi-technologies/cache@v4` in your workflows, simply replace instances of `actions/cache@v4` with `vi-technologies/cache@v4`. For detailed usage and configuration options, refer to the original [actions/cache](https://github.com/actions/cache) documentation, as our fork maintains compatibility with all the official options.

```yaml
steps:
- uses: vi-technologies/cache@v4
  with:
    path: |
      path/to/cache
    key: cache-key-${{ runner.os }}-${{ hashFiles('**/lock-files') }}
    bucketName: my-s3-bucket
```

Switching to our enhanced cache action means your workflows can now benefit from the flexibility, speed, and efficiency that comes with cross-branch caching and the robust storage capabilities of AWS S3.