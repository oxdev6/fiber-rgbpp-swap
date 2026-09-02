use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpResponse, HttpServer, Responder};
use env_logger::Env;
use std::path::PathBuf;
use std::sync::Arc;

mod swap;
use swap::{SwapListItem, SwapManager, SwapRequest, SwapResponse, SwapStatusResponse};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let ckb_rpc_url = std::env::var("CKB_RPC_URL").unwrap_or_else(|_| "http://127.0.0.1:8114".into());
    let store_path = PathBuf::from("./backend/state/swaps.json");
    let manager = Arc::new(SwapManager::new(&ckb_rpc_url, store_path));

    log::info!("Starting Fiber RGB++ Swap backend at http://127.0.0.1:8080");
    log::info!("CKB RPC endpoint: {}", ckb_rpc_url);

    HttpServer::new(move || {
        let cors = Cors::permissive();
        App::new()
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(web::Data::from(manager.clone()))
            .route("/api/health", web::get().to(health))
            .route("/api/swap/initiate", web::post().to(initiate_swap))
            .route("/api/swap/{swap_id}", web::get().to(get_swap_status))
            .route("/api/swap/{swap_id}/raw", web::get().to(get_swap_raw))
            .route("/api/swap", web::get().to(list_swaps))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}

async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}

async fn initiate_swap(
    manager: web::Data<Arc<SwapManager>>,
    request: web::Json<SwapRequest>,
) -> impl Responder {
    match manager.initiate_swap(request.into_inner()).await {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(err) => {
            log::error!("Swap initiation failed: {}", err);
            HttpResponse::BadRequest().json(serde_json::json!({
                "error": err.to_string(),
            }))
        }
    }
}

async fn get_swap_status(
    manager: web::Data<Arc<SwapManager>>,
    path: web::Path<String>,
) -> impl Responder {
    let swap_id = path.into_inner();
    match manager.get_status(&swap_id).await {
        Some(status) => HttpResponse::Ok().json(status),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Swap not found",
        })),
    }
}

async fn get_swap_raw(
    manager: web::Data<Arc<SwapManager>>,
    path: web::Path<String>,
) -> impl Responder {
    let swap_id = path.into_inner();
    match manager.get_raw(&swap_id).await {
        Some(raw) => HttpResponse::Ok().json(raw),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Swap not found",
        })),
    }
}

async fn list_swaps(manager: web::Data<Arc<SwapManager>>) -> impl Responder {
    let list = manager.list_swaps().await;
    HttpResponse::Ok().json(list)
}
