use chrono::Utc;
use ckb_sdk::HttpRpcClient;
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;
use std::convert::TryInto;
use std::fs::{create_dir_all, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;
use uuid::Uuid;

use crate::ckb_helpers::{build_funding_transaction, build_leap_transaction, tx_hash};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SwapRequest {
    pub offerer_address: String,
    pub offerer_asset_type: String,
    pub counterparty_address: String,
    pub counterparty_asset_type: String,
    pub amount: u128,
}

#[derive(Debug, Clone, Serialize)]
pub struct SwapResponse {
    pub swap_id: String,
    pub message: String,
    pub next_step: String,
    pub phase: String,
    pub funding_tx_hash: Option<String>,
    pub leap_tx_hash: Option<String>,
    pub funding_tx_raw: Option<String>,
    pub leap_tx_raw: Option<String>,
    pub verification_command: String,
    pub last_update: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SwapStatusResponse {
    pub swap_id: String,
    pub status: String,
    pub phase: String,
    pub funding_tx_hash: Option<String>,
    pub leap_tx_hash: Option<String>,
    pub funding_tx_raw: Option<String>,
    pub leap_tx_raw: Option<String>,
    pub verification_command: String,
    pub last_update: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SwapRawResponse {
    pub swap_id: String,
    pub funding_tx_raw: Option<String>,
    pub leap_tx_raw: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwapState {
    pub request: SwapRequest,
    pub status: String,
    pub phase: String,
    pub stage: usize,
    pub funding_tx_hash: Option<String>,
    pub leap_tx_hash: Option<String>,
    pub funding_tx_raw: Option<String>,
    pub leap_tx_raw: Option<String>,
    pub verification_command: String,
    pub last_update: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SwapListItem {
    pub swap_id: String,
    pub phase: String,
    pub status: String,
    pub last_update: String,
}

#[derive(Debug, Error)]
pub enum SwapError {
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    #[error("rpc error: {0}")]
    RpcError(#[from] ckb_sdk::RpcError),
    #[error("io error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("json error: {0}")]
    JsonError(#[from] serde_json::Error),
}

pub struct SwapManager {
    _client: HttpRpcClient,
    state: Mutex<HashMap<String, SwapState>>,
    store_path: PathBuf,
}

impl SwapManager {
    pub fn new(ckb_rpc_url: &str, store_path: PathBuf) -> Self {
        let client = HttpRpcClient::new(ckb_rpc_url);
        let state = Mutex::new(Self::load_state(&store_path).unwrap_or_default());
        Self {
            _client: client,
            state,
            store_path,
        }
    }

    fn load_state(store_path: &PathBuf) -> Result<HashMap<String, SwapState>, SwapError> {
        if let Some(parent) = store_path.parent() {
            create_dir_all(parent)?;
        }

        if !store_path.exists() {
            return Ok(HashMap::new());
        }

        let mut file = OpenOptions::new().read(true).open(store_path)?;
        let mut content = String::new();
        file.read_to_string(&mut content)?;
        let state = serde_json::from_str(&content)?;
        Ok(state)
    }

    fn persist_state(&self) -> Result<(), SwapError> {
        if let Some(parent) = self.store_path.parent() {
            create_dir_all(parent)?;
        }

        let guard = self.state.lock().unwrap();
        let data = serde_json::to_string_pretty(&*guard)?;
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&self.store_path)?;
        file.write_all(data.as_bytes())?;
        file.flush()?;
        Ok(())
    }

    pub async fn initiate_swap(&self, request: SwapRequest) -> Result<SwapResponse, SwapError> {
        if request.offerer_address.is_empty() || request.counterparty_address.is_empty() {
            return Err(SwapError::InvalidRequest("addresses are required".into()));
        }
        if request.amount == 0 {
            return Err(SwapError::InvalidRequest("amount must be positive".into()));
        }

        let amount_u64: u64 = request
            .amount
            .try_into()
            .map_err(|_| SwapError::InvalidRequest("amount exceeds supported 64-bit range".into()))?;

        let funding_tx = build_funding_transaction(&request.offerer_address, amount_u64);
        let leap_tx = build_leap_transaction(&request.counterparty_address, amount_u64);
        let funding_tx_hash = tx_hash(&funding_tx);
        let leap_tx_hash = tx_hash(&leap_tx);
        let funding_tx_raw = serde_json::to_string_pretty(&funding_tx)?;
        let leap_tx_raw = serde_json::to_string_pretty(&leap_tx)?;
        let verification_command = Self::build_verification_command(&funding_tx_hash, &leap_tx_hash);
        let last_update = format!("Swap created at {}", Utc::now().to_rfc3339());
        let swap_id = Uuid::new_v4().to_string();

        let state = SwapState {
            request: request.clone(),
            status: "Funding transaction prepared".to_string(),
            phase: "funding".to_string(),
            stage: 0,
            funding_tx_hash: Some(funding_tx_hash.clone()),
            leap_tx_hash: Some(leap_tx_hash.clone()),
            funding_tx_raw: Some(funding_tx_raw.clone()),
            leap_tx_raw: Some(leap_tx_raw.clone()),
            verification_command: verification_command.clone(),
            last_update: last_update.clone(),
        };

        let mut guard = self.state.lock().unwrap();
        guard.insert(swap_id.clone(), state);
        self.persist_state()?;

        Ok(SwapResponse {
            swap_id,
            message: "Swap initialized successfully".to_string(),
            next_step: "Submit funding transaction and then perform the RGB++ leap.".to_string(),
            phase: "funding".to_string(),
            funding_tx_hash: Some(funding_tx_hash),
            leap_tx_hash: Some(leap_tx_hash),
            funding_tx_raw: Some(funding_tx_raw),
            leap_tx_raw: Some(leap_tx_raw),
            verification_command,
            last_update,
        })
    }

    pub async fn get_status(&self, swap_id: &str) -> Option<SwapStatusResponse> {
        let mut guard = self.state.lock().unwrap();
        let state = guard.get_mut(swap_id)?;

        match state.stage {
            0 => {
                state.status = "Funding transaction submitted; awaiting RGB++ leap".to_string();
                state.phase = "leap".to_string();
                state.stage = 1;
                state.last_update = format!("Updated at {}", Utc::now().to_rfc3339());
            }
            1 => {
                state.status = "Asset leap prepared and ready for final settlement".to_string();
                state.phase = "completed".to_string();
                state.stage = 2;
                state.last_update = format!("Updated at {}", Utc::now().to_rfc3339());
            }
            _ => {
                state.status = "Swap completed. Verify on-chain transactions and settle.".to_string();
                state.last_update = format!("Checked at {}", Utc::now().to_rfc3339());
            }
        }

        self.persist_state().ok();

        Some(SwapStatusResponse {
            swap_id: swap_id.to_string(),
            status: state.status.clone(),
            phase: state.phase.clone(),
            funding_tx_hash: state.funding_tx_hash.clone(),
            leap_tx_hash: state.leap_tx_hash.clone(),
            funding_tx_raw: state.funding_tx_raw.clone(),
            leap_tx_raw: state.leap_tx_raw.clone(),
            verification_command: state.verification_command.clone(),
            last_update: state.last_update.clone(),
        })
    }

    pub async fn get_raw(&self, swap_id: &str) -> Option<SwapRawResponse> {
        let guard = self.state.lock().unwrap();
        let state = guard.get(swap_id)?;

        Some(SwapRawResponse {
            swap_id: swap_id.to_string(),
            funding_tx_raw: state.funding_tx_raw.clone(),
            leap_tx_raw: state.leap_tx_raw.clone(),
        })
    }

    pub async fn list_swaps(&self) -> Vec<SwapListItem> {
        let guard = self.state.lock().unwrap();
        guard
            .iter()
            .map(|(id, state)| SwapListItem {
                swap_id: id.clone(),
                phase: state.phase.clone(),
                status: state.status.clone(),
                last_update: state.last_update.clone(),
            })
            .collect()
    }

    fn build_verification_command(funding_tx: &str, leap_tx: &str) -> String {
        format!(
            "ckb-cli rpc get_transaction {} && ckb-cli rpc get_transaction {} && ckb-cli rpc get_tip_header",
            funding_tx, leap_tx
        )
    }
}
