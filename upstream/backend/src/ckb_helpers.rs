use ckb_types::{
    core::{Capacity, ScriptHashType, TransactionBuilder},
    packed::{Byte32, Bytes, CellDep, CellInput, CellOutput, OutPoint, Script, WitnessArgs},
    prelude::*,
};

pub fn tx_hash(transaction: &ckb_types::core::TransactionView) -> String {
    format!("0x{}", transaction.hash().to_string())
}

fn dummy_outpoint() -> OutPoint {
    OutPoint::new_builder()
        .tx_hash(Byte32::from_slice(&[0u8; 32]).expect("valid zero hash"))
        .index(0u32.pack())
        .build()
}

fn build_script_from_address(address: &str) -> Script {
    let args = Bytes::from(address.as_bytes().to_vec()).pack();
    Script::new_builder()
        .code_hash(Byte32::from_slice(&[0u8; 32]).expect("valid code hash"))
        .hash_type(ScriptHashType::Type.into())
        .args(args)
        .build()
}

fn build_dummy_cell_dep() -> CellDep {
    CellDep::new_builder()
        .out_point(dummy_outpoint())
        .dep_type(ckb_types::packed::DepType::Code.into())
        .build()
}

pub fn build_funding_transaction(offerer_address: &str, amount: u64) -> ckb_types::core::TransactionView {
    let lock_script = build_script_from_address(offerer_address);
    let output = CellOutput::new_builder()
        .capacity(Capacity::shannons(amount).pack())
        .lock(lock_script)
        .build();

    TransactionBuilder::default()
        .cell_dep(build_dummy_cell_dep())
        .input(CellInput::new_builder().previous_output(dummy_outpoint()).build())
        .output(output)
        .output_data(Bytes::new().pack())
        .witness(WitnessArgs::default().as_bytes().pack())
        .build()
}

pub fn build_leap_transaction(counterparty_address: &str, amount: u64) -> ckb_types::core::TransactionView {
    let lock_script = build_script_from_address(counterparty_address);
    let output = CellOutput::new_builder()
        .capacity(Capacity::shannons(amount).pack())
        .lock(lock_script)
        .build();

    TransactionBuilder::default()
        .cell_dep(build_dummy_cell_dep())
        .input(CellInput::new_builder().previous_output(dummy_outpoint()).build())
        .output(output)
        .output_data(Bytes::new().pack())
        .witness(WitnessArgs::default().as_bytes().pack())
        .build()
}
