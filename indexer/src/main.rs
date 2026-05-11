use axum::{extract::{Path, Query, State}, response::IntoResponse, routing::get, Json, Router};
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, sync::Arc};

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, env = "DATABASE_URL")]
    database_url: String,
    #[arg(long, env = "PACKAGE_ID")]
    package_id: String,
    #[arg(long, env = "BIND", default_value = "127.0.0.1:8088")]
    bind: SocketAddr,
}

#[derive(Clone)]
struct AppState {
    package_id: String,
}

#[derive(Debug, Deserialize)]
struct SubmissionQuery {
    status: Option<u8>,
    q: Option<String>,
    cursor: Option<String>,
}

#[derive(Debug, Serialize)]
struct IndexedSubmission {
    submission_id: String,
    form_id: String,
    submitter: String,
    status: u8,
    submitted_at_ms: u64,
    blob_id: String,
    file_blob_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct Facets {
    open: u64,
    triaged: u64,
    in_progress: u64,
    resolved: u64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let args = Args::parse();
    tracing::info!(package_id = %args.package_id, database_url = %redact(&args.database_url), "starting walrus forms indexer api");

    // TODO: wire sui-indexer-alt-framework sequential pipelines here:
    // - walrus_forms::submission::SubmissionCreated
    // - walrus_forms::submission::SubmissionStatusChanged
    // - walrus_forms::reputation::ReputationChanged
    // - walrus_forms::bounty::{BountySponsored,BountyReleased}
    // - Walrus BlobCertified events and Metadata dynamic fields
    //
    // The REST API below is intentionally stable so the dashboard can switch
    // from direct RPC/event queries to this service without UI churn.

    let state = Arc::new(AppState { package_id: args.package_id });
    let app = Router::new()
        .route("/health", get(health))
        .route("/forms/:form_id/submissions", get(list_submissions))
        .route("/forms/:form_id/facets", get(facets))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(args.bind).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "packageId": state.package_id }))
}

async fn list_submissions(
    Path(form_id): Path<String>,
    Query(query): Query<SubmissionQuery>,
) -> impl IntoResponse {
    let _ = (&query.status, &query.q, &query.cursor);
    Json(Vec::<IndexedSubmission>::new().into_iter().filter(|row| row.form_id == form_id).collect::<Vec<_>>())
}

async fn facets(Path(_form_id): Path<String>) -> impl IntoResponse {
    Json(Facets {
        open: 0,
        triaged: 0,
        in_progress: 0,
        resolved: 0,
    })
}

fn redact(value: &str) -> String {
    if value.len() <= 12 {
        return "***".to_string();
    }
    format!("{}…{}", &value[..6], &value[value.len() - 4..])
}
