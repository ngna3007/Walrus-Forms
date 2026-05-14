# Custom Walrus Indexer

Rust indexer plan using `sui-indexer-alt-framework` to index `Submission` objects,
reputation events, bounty events, and Walrus `Blob` metadata into Postgres for fast
filter/search at more than 10k submissions per form.

For MVP, the frontend queries `Submission` shared objects via `SuiClient.queryEvents` and `getOwnedObjects`, which is sufficient for low-volume forms.

## Pipelines

1. `submissions` keyed by `submission_id`.
2. `submission_statuses` keyed by `(submission_id, checkpoint)`.
3. `submitter_reputation` keyed by `submitter`.
4. `bounties` keyed by `bounty_id`.
5. `walrus_blobs` keyed by `blob_id`.

## API

- `GET /forms/:form_id/submissions?status=&q=&cursor=`
- `GET /forms/:form_id/facets`
- `GET /submitters/:address/reputation`
- `GET /bounties/:form_id`
- `POST /webhooks/forward`

The dashboard can use these routes as a drop-in replacement for event queries
once a form crosses local query limits.

See `schema.sql` and `src/types.ts` for the implementation contract.
