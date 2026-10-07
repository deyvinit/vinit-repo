use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct AppState {
    db_pool: Option<PgPool>,
}

#[derive(Serialize)]
struct HelloResponse {
    message: String,
    service: String,
    status: String,
}

#[derive(Serialize)]
struct DeleteResponse {
    status: String,
    message: String,
    deleted_id: i32,
    handled_by: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    status: String,
    error: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@db:5432/tododb".to_string());

    println!("Connecting to database at {}...", database_url);

    // Attempt connecting to PostgreSQL with retry loop to wait for db container readiness
    let mut pool = None;
    for attempt in 1..=10 {
        match PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(3))
            .connect(&database_url)
            .await
        {
            Ok(p) => {
                println!("Successfully connected to PostgreSQL database!");
                pool = Some(p);
                break;
            }
            Err(e) => {
                println!(
                    "Attempt {attempt}/10: Database not ready ({e}). Retrying in 2 seconds..."
                );
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    let shared_state = Arc::new(AppState { db_pool: pool });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(hello_handler))
        .route("/health", get(health_handler))
        .route("/todos/:id", delete(delete_todo_handler))
        .layer(cors)
        .with_state(shared_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("Rust API microservice listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// GET / - Whiteboard requirement: "hello world from Rust"
async fn hello_handler() -> Json<HelloResponse> {
    Json(HelloResponse {
        message: "hello world from Rust".to_string(),
        service: "Rust Axum Microservice".to_string(),
        status: "ok".to_string(),
    })
}

/// GET /health - Basic health probe
async fn health_handler() -> (StatusCode, &'static str) {
    (StatusCode::OK, "OK")
}

/// DELETE /todos/:id - Bonus requirement: Handle deletion in Rust
async fn delete_todo_handler(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> impl IntoResponse {
    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::to_value(ErrorResponse {
                    status: "error".to_string(),
                    error: "Database connection pool is not available".to_string(),
                }).unwrap()),
            );
        }
    };

    println!("[Rust Service] Executing DELETE for todo id: {}", id);

    let result = sqlx::query("DELETE FROM todos WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await;

    match result {
        Ok(query_result) => {
            if query_result.rows_affected() == 0 {
                (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::to_value(ErrorResponse {
                        status: "not_found".to_string(),
                        error: format!("Todo with id {} does not exist", id),
                    }).unwrap()),
                )
            } else {
                (
                    StatusCode::OK,
                    Json(serde_json::to_value(DeleteResponse {
                        status: "success".to_string(),
                        message: format!("Todo {} deleted successfully from PostgreSQL", id),
                        deleted_id: id,
                        handled_by: "Rust Axum Microservice".to_string(),
                    }).unwrap()),
                )
            }
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::to_value(ErrorResponse {
                status: "error".to_string(),
                error: format!("Database error: {}", err),
            }).unwrap()),
        ),
    }
}

