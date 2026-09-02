use gloo_console::log;
use gloo_net::http::Request;
use gloo_timers::callback::Interval;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::HtmlInputElement;
use web_sys::window;
use yew::prelude::*;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SwapRequest {
    offerer_address: String,
    offerer_asset_type: String,
    counterparty_address: String,
    counterparty_asset_type: String,
    amount: u128,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SwapResponse {
    swap_id: String,
    message: String,
    next_step: String,
    phase: String,
    funding_tx_hash: Option<String>,
    leap_tx_hash: Option<String>,
    funding_tx_raw: Option<String>,
    leap_tx_raw: Option<String>,
    verification_command: String,
    last_update: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SwapStatusResponse {
    swap_id: String,
    status: String,
    phase: String,
    funding_tx_hash: Option<String>,
    leap_tx_hash: Option<String>,
    funding_tx_raw: Option<String>,
    leap_tx_raw: Option<String>,
    verification_command: String,
    last_update: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SwapListItem {
    swap_id: String,
    phase: String,
    status: String,
    last_update: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SwapRawResponse {
    swap_id: String,
    funding_tx_raw: Option<String>,
    leap_tx_raw: Option<String>,
}

enum FetchState {
    Idle,
    Submitting,
    Completed(String),
    Error(String),
}

#[function_component(App)]
fn app() -> Html {
    let offerer_address = use_state(String::new);
    let offerer_asset_type = use_state(String::new);
    let counterparty_address = use_state(String::new);
    let counterparty_asset_type = use_state(String::new);
    let amount = use_state(String::new);
    let swap_id = use_state(String::new);
    let swap_status = use_state(|| None as Option<SwapStatusResponse>);
    let swap_raw = use_state(|| None as Option<SwapRawResponse>);
    let swap_list = use_state(|| Vec::new());
    let status = use_state(|| FetchState::Idle);
    let interval_handle = use_mut_ref(|| None as Option<Interval>);

    let fetch_swaps = {
        let swap_list = swap_list.clone();
        let status = status.clone();
        Callback::from(move |_| {
            let swap_list = swap_list.clone();
            let status = status.clone();
            wasm_bindgen_futures::spawn_local(async move {
                match Request::get("/api/swap").send().await {
                    Ok(resp) => {
                        if resp.status() == 200 {
                            match resp.json::<Vec<SwapListItem>>().await {
                                Ok(body) => {
                                    swap_list.set(body);
                                }
                                Err(err) => {
                                    status.set(FetchState::Error(err.to_string()));
                                }
                            }
                        } else {
                            let text = resp.text().await.unwrap_or_default();
                            status.set(FetchState::Error(text));
                        }
                    }
                    Err(err) => {
                        status.set(FetchState::Error(err.to_string()));
                    }
                }
            });
        })
    };

    let fetch_status = {
        let swap_status = swap_status.clone();
        let status = status.clone();
        Callback::from(move |id: String| {
            let swap_status = swap_status.clone();
            let status = status.clone();
            wasm_bindgen_futures::spawn_local(async move {
                if id.is_empty() {
                    return;
                }

                match Request::get(format!("/api/swap/{}", id)).send().await {
                    Ok(resp) => {
                        if resp.status() == 200 {
                            match resp.json::<SwapStatusResponse>().await {
                                Ok(body) => {
                                    swap_status.set(Some(body));
                                }
                                Err(err) => {
                                    status.set(FetchState::Error(err.to_string()));
                                }
                            }
                        } else {
                            let text = resp.text().await.unwrap_or_default();
                            status.set(FetchState::Error(text));
                        }
                    }
                    Err(err) => {
                        status.set(FetchState::Error(err.to_string()));
                    }
                }
            });
        })
    };

    // helper to copy text to clipboard and set a small status
    let make_copy = |text: String| {
        let status = status.clone();
        Callback::from(move |_| {
            let t = text.clone();
            let status = status.clone();
            wasm_bindgen_futures::spawn_local(async move {
                if let Some(win) = window() {
                    if let Some(clip) = win.navigator().clipboard() {
                        match clip.write_text(&t) {
                            Ok(promise) => {
                                let _ = JsFuture::from(promise).await;
                                status.set(FetchState::Completed("Copied to clipboard".into()));
                            }
                            Err(_) => status.set(FetchState::Error("Clipboard write failed".into())),
                        }
                    } else {
                        status.set(FetchState::Error("Clipboard not available".into()));
                    }
                } else {
                    status.set(FetchState::Error("No window object".into()));
                }
            });
        })
    };

    let fetch_raw = {
        let swap_raw = swap_raw.clone();
        let status = status.clone();
        Callback::from(move |id: String| {
            let swap_raw = swap_raw.clone();
            let status = status.clone();
            wasm_bindgen_futures::spawn_local(async move {
                if id.is_empty() {
                    return;
                }

                match Request::get(format!("/api/swap/{}/raw", id)).send().await {
                    Ok(resp) => {
                        if resp.status() == 200 {
                            match resp.json::<SwapRawResponse>().await {
                                Ok(body) => {
                                    swap_raw.set(Some(body));
                                }
                                Err(err) => {
                                    status.set(FetchState::Error(err.to_string()));
                                }
                            }
                        } else {
                            let text = resp.text().await.unwrap_or_default();
                            status.set(FetchState::Error(text));
                        }
                    }
                    Err(err) => {
                        status.set(FetchState::Error(err.to_string()));
                    }
                }
            });
        })
    };

    {
        let swap_id = swap_id.clone();
        let fetch_status = fetch_status.clone();
        let interval_handle = interval_handle.clone();
        use_effect_with_deps(move |id| {
            if id.is_empty() {
                *interval_handle.borrow_mut() = None;
                return || {};
            }

            let id = id.clone();
            let fetch_status = fetch_status.clone();
            let interval = Interval::new(10_000, move || {
                fetch_status.emit(id.clone());
            });
            *interval_handle.borrow_mut() = Some(interval);

            || {
                *interval_handle.borrow_mut() = None;
            }
        }, swap_id.clone());
    }

    {
        let fetch_swaps = fetch_swaps.clone();
        use_effect(move || {
            fetch_swaps.emit(());
            || {}
        });
    }

    let onsubmit = {
        let offerer_address = offerer_address.clone();
        let offerer_asset_type = offerer_asset_type.clone();
        let counterparty_address = counterparty_address.clone();
        let counterparty_asset_type = counterparty_asset_type.clone();
        let amount = amount.clone();
        let swap_id = swap_id.clone();
        let swap_status = swap_status.clone();
        let swap_list = swap_list.clone();
        let status = status.clone();
        let fetch_status = fetch_status.clone();
        let fetch_swaps = fetch_swaps.clone();
        Callback::from(move |event: FocusEvent| {
            event.prevent_default();
            let offerer_address = (*offerer_address).clone();
            let offerer_asset_type = (*offerer_asset_type).clone();
            let counterparty_address = (*counterparty_address).clone();
            let counterparty_asset_type = (*counterparty_asset_type).clone();
            let amount = (*amount).clone();
            let swap_id = swap_id.clone();
            let swap_status = swap_status.clone();
            let swap_list = swap_list.clone();
            let status = status.clone();
            let fetch_status = fetch_status.clone();
            let fetch_swaps = fetch_swaps.clone();

            wasm_bindgen_futures::spawn_local(async move {
                status.set(FetchState::Submitting);

                let request_body = SwapRequest {
                    offerer_address,
                    offerer_asset_type,
                    counterparty_address,
                    counterparty_asset_type,
                    amount: amount.parse().unwrap_or(0),
                };

                let request = Request::post("/api/swap/initiate")
                    .header("Content-Type", "application/json")
                    .body(serde_json::to_string(&request_body).unwrap());

                match request.send().await {
                    Ok(response) => {
                        if response.status() == 200 {
                            match response.json::<SwapResponse>().await {
                                Ok(body) => {
                                    let message = format!(
                                        "Swap created: {}\n{}\n{}",
                                        body.swap_id, body.message, body.next_step,
                                    );
                                    swap_id.set(body.swap_id.clone());
                                    status.set(FetchState::Completed(message));
                                    swap_status.set(Some(SwapStatusResponse {
                                        swap_id: body.swap_id.clone(),
                                        status: "initialized".to_string(),
                                        phase: body.phase,
                                        funding_tx_hash: body.funding_tx_hash,
                                        leap_tx_hash: body.leap_tx_hash,
                                        funding_tx_raw: body.funding_tx_raw.clone(),
                                        leap_tx_raw: body.leap_tx_raw.clone(),
                                        verification_command: body.verification_command.clone(),
                                        last_update: body.last_update.clone(),
                                    }));
                                    fetch_status.emit(body.swap_id.clone());
                                    fetch_swaps.emit(());
                                }
                                Err(err) => status.set(FetchState::Error(err.to_string())),
                            }
                        } else {
                            let text = response.text().await.unwrap_or_default();
                            status.set(FetchState::Error(text));
                        }
                    }
                    Err(err) => status.set(FetchState::Error(err.to_string())),
                }
            });
        })
    };

    let on_offer_address_input = {
        let offerer_address = offerer_address.clone();
        Callback::from(move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            offerer_address.set(input.value());
        })
    };
    let on_offer_asset_type_input = {
        let offerer_asset_type = offerer_asset_type.clone();
        Callback::from(move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            offerer_asset_type.set(input.value());
        })
    };
    let on_counterparty_address_input = {
        let counterparty_address = counterparty_address.clone();
        Callback::from(move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            counterparty_address.set(input.value());
        })
    };
    let on_counterparty_asset_type_input = {
        let counterparty_asset_type = counterparty_asset_type.clone();
        Callback::from(move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            counterparty_asset_type.set(input.value());
        })
    };
    let on_amount_input = {
        let amount = amount.clone();
        Callback::from(move |e: InputEvent| {
            let input: HtmlInputElement = e.target_unchecked_into();
            amount.set(input.value());
        })
    };

    let on_refresh = {
        let swap_id = swap_id.clone();
        let fetch_status = fetch_status.clone();
        Callback::from(move |_| {
            let id = (*swap_id).clone();
            fetch_status.emit(id);
        })
    };

    let on_fetch_raw = {
        let swap_id = swap_id.clone();
        let fetch_raw = fetch_raw.clone();
        Callback::from(move |_| {
            let id = (*swap_id).clone();
            fetch_raw.emit(id);
        })
    };

    let render_status = match &*status {
        FetchState::Idle => html! { <p>{ "Ready to initiate a swap." }</p> },
        FetchState::Submitting => html! { <p>{ "Submitting swap request..." }</p> },
        FetchState::Completed(value) => html! { <pre class="status">{ value }</pre> },
        FetchState::Error(error) => html! { <pre class="status">{ format!("Error: {}", error) }</pre> },
    };

    let fetch_swaps_btn = fetch_swaps.clone();

    let status_detail = if let Some(current_status) = &*swap_status {
        html! {
            <div class="panel info-panel">
                <div class="panel-row">
                    <div>
                        <p class="eyebrow">{ "Swap information" }</p>
                        <h3>{ "Current status" }</h3>
                    </div>
                    <div class="panel-actions">
                        <button class="btn-ghost" onclick={make_copy(current_status.funding_tx_hash.clone().unwrap_or_default())}>{ "Copy funding hash" }</button>
                        <button class="btn-ghost" onclick={make_copy(current_status.leap_tx_hash.clone().unwrap_or_default())}>{ "Copy leap hash" }</button>
                    </div>
                </div>

                <div class="panel-row">
                    <div>
                        <p><strong>{ "Swap ID" }</strong></p>
                        <p>{ &current_status.swap_id }</p>
                    </div>
                    <div>
                        <p><strong>{ "Phase" }</strong></p>
                        <p>{ &current_status.phase }</p>
                    </div>
                    <div>
                        <p><strong>{ "Status" }</strong></p>
                        <p>{ &current_status.status }</p>
                    </div>
                    <div>
                        <p><strong>{ "Last update" }</strong></p>
                        <p>{ &current_status.last_update }</p>
                    </div>
                </div>

                <div class="info-panel">
                    <p><strong>{ "Verification command" }</strong></p>
                    <pre class="code-block">{ &current_status.verification_command }</pre>
                </div>

                <div class="panel-actions">
                    <button type="button" class="secondary" onclick={on_fetch_raw.clone()}>{ "Load raw payload" }</button>
                </div>
            </div>
        }
    } else {
        html! { <div class="info-panel"><p>{ "No swap status available yet." }</p></div> }
    };

    let raw_detail = if let Some(raw) = &*swap_raw {
        html! {
            <div class="panel info-panel">
                <h3>{ "Raw swap payload" }</h3>
                <div class="panel-actions">
                    <button class="copy-btn" onclick={make_copy(raw.funding_tx_raw.clone().unwrap_or_default())}>{ "Copy funding tx raw" }</button>
                    <button class="copy-btn" onclick={make_copy(raw.leap_tx_raw.clone().unwrap_or_default())}>{ "Copy leap tx raw" }</button>
                </div>
                <p><strong>{ "Funding tx raw" }</strong></p>
                <pre class="code-block">{ raw.funding_tx_raw.as_deref().unwrap_or("n/a") }</pre>
                <p><strong>{ "Leap tx raw" }</strong></p>
                <pre class="code-block">{ raw.leap_tx_raw.as_deref().unwrap_or("n/a") }</pre>
            </div>
        }
    } else {
        html! {}
    };

    html! {
        <div class="app">
            <div class="card">
                <div class="header">
                    <div class="brand">
                        <div class="logo"></div>
                        <div>
                            <p class="eyebrow">{ "Fiber RGB++ Swap" }</p>
                            <h1>{ "Rust-based swap coordination" }</h1>
                            <div class="muted">{ "Professional frontend for cross-chain RGB++ swap lifecycle." }</div>
                        </div>
                    </div>
                    <div class="top-actions">
                        <button class="btn-ghost" onclick={Callback::from(move |_| fetch_swaps_btn.emit(()))}>{ "Refresh swaps" }</button>
                    </div>
                </div>

                <div class="grid">
                    <section class="panel">
                        <p class="eyebrow">{ "New swap" }</p>
                        <h2>{ "Initiate swap request" }</h2>
                        <form onsubmit={onsubmit}>
                            <div class="row">
                                <div>
                                    <label for="offerer_address">{ "Offerer CKB Address" }</label>
                                    <input id="offerer_address" type="text" value={(*offerer_address).clone()} placeholder="ckb..." oninput={on_offer_address_input} />
                                </div>
                                <div>
                                    <label for="offerer_asset_type">{ "Offerer Asset Type" }</label>
                                    <input id="offerer_asset_type" type="text" value={(*offerer_asset_type).clone()} placeholder="RGB++ or UDT" oninput={on_offer_asset_type_input} />
                                </div>
                                <div>
                                    <label for="counterparty_address">{ "Counterparty CKB Address" }</label>
                                    <input id="counterparty_address" type="text" value={(*counterparty_address).clone()} placeholder="ckb..." oninput={on_counterparty_address_input} />
                                </div>
                                <div>
                                    <label for="counterparty_asset_type">{ "Counterparty Asset Type" }</label>
                                    <input id="counterparty_asset_type" type="text" value={(*counterparty_asset_type).clone()} placeholder="RGB++ or UDT" oninput={on_counterparty_asset_type_input} />
                                </div>
                                <div class="full">
                                    <label for="amount">{ "Amount" }</label>
                                    <input id="amount" type="number" value={(*amount).clone()} placeholder="100000000" oninput={on_amount_input} />
                                </div>
                            </div>
                            <div class="panel-actions">
                                <button type="submit" class="primary">{ "Initiate Swap" }</button>
                                <button type="button" class="secondary" onclick={on_refresh}>{ "Refresh status" }</button>
                                <button type="button" class="secondary" onclick={on_fetch_raw}>{ "Fetch raw swap payload" }</button>
                            </div>
                        </form>

                        <div class="info-panel">
                            { render_status }
                        </div>
                    </section>

                    <section class="panel">
                        <p class="eyebrow">{ "Status & payload" }</p>
                        <h2>{ "Live swap details" }</h2>
                        { status_detail }
                        { raw_detail }
                    </section>
                </div>

                <section class="panel">
                    <div class="panel-row">
                        <div>
                            <p class="eyebrow">{ "Swap history" }</p>
                            <h2>{ "Recent swaps" }</h2>
                        </div>
                        <button class="btn-ghost" type="button" onclick={Callback::from(move |_| fetch_swaps_btn.emit(()))}>{ "Refresh list" }</button>
                    </div>
                    { if swap_list.is_empty() {
                        html! { <p>{ "No swaps found yet." }</p> }
                    } else {
                        html! {
                            <table class="swap-table">
                                <thead>
                                    <tr>
                                        <th>{ "Swap ID" }</th>
                                        <th>{ "Phase" }</th>
                                        <th>{ "Status" }</th>
                                        <th>{ "Last update" }</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { for swap_list.iter().map(|item| html! {
                                        <tr>
                                            <td>{ &item.swap_id }</td>
                                            <td>{ &item.phase }</td>
                                            <td>{ &item.status }</td>
                                            <td>{ &item.last_update }</td>
                                        </tr>
                                    }) }
                                </tbody>
                            </table>
                        }
                    } }
                </section>
            </div>
        </div>
    }
        <div class="app">
            <div class="card">
                                <div class="header">
                                    <div class="brand">
                                        <div class="logo"></div>
                                        <div>
                                            <h1>{ "Fiber RGB++ Swap" }</h1>
                                            <div class="muted">{ "Rust + CKB SDK prototype — now moving to production-ready UI" }</div>
                                        </div>
                                    </div>
                                    <div>
                                        <button class="btn-ghost" onclick={Callback::from(move |_| fetch_swaps_btn.emit(()))}>{ "Refresh swaps" }</button>
                                    </div>
                                </div>

                <form onsubmit={onsubmit}>
                    <div class="row">
                        <div>
                            <label for="offerer_address">{ "Offerer CKB Address" }</label>
                            <input id="offerer_address" type="text" value={(*offerer_address).clone()} placeholder="ckb..." oninput={on_offer_address_input} />
                        </div>
                        <div>
                            <label for="offerer_asset_type">{ "Offerer Asset Type" }</label>
                            <input id="offerer_asset_type" type="text" value={(*offerer_asset_type).clone()} placeholder="RGB++ or UDT" oninput={on_offer_asset_type_input} />
                        </div>
                        <div>
                            <label for="counterparty_address">{ "Counterparty CKB Address" }</label>
                            <input id="counterparty_address" type="text" value={(*counterparty_address).clone()} placeholder="ckb..." oninput={on_counterparty_address_input} />
                        </div>
                        <div>
                            <label for="counterparty_asset_type">{ "Counterparty Asset Type" }</label>
                            <input id="counterparty_asset_type" type="text" value={(*counterparty_asset_type).clone()} placeholder="RGB++ or UDT" oninput={on_counterparty_asset_type_input} />
                        </div>
                        <div class="full">
                            <label for="amount">{ "Amount" }</label>
                            <input id="amount" type="number" value={(*amount).clone()} placeholder="100000000" oninput={on_amount_input} />
                        </div>
                    </div>
                    <button type="submit">{ "Initiate Swap" }</button>
                </form>

                <div style="margin-top: 1rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
                    <button type="button" onclick={on_refresh}>{ "Refresh status" }</button>
                    <button type="button" onclick={on_fetch_raw}>{ "Fetch raw swap payload" }</button>
                    <span>{ format!("Current swap ID: {}", (*swap_id).clone()) }</span>
                </div>

                { render_status }
                <div style="margin-top: 1.5rem;">{ status_detail }</div>
                <div style="margin-top: 1.5rem;">{ raw_detail }</div>
                <div style="margin-top: 1.5rem;">
                    <h2>{ "Swap history" }</h2>
                    <button type="button" onclick={Callback::from(move |_| fetch_swaps.emit(()))}>{ "Refresh swap list" }</button>
                    { if swap_list.is_empty() {
                        html! { <p>{ "No swaps found yet." }</p> }
                    } else {
                        html! {
                            <table class="swap-table">
                                <thead>
                                    <tr>
                                        <th>{ "Swap ID" }</th>
                                        <th>{ "Phase" }</th>
                                        <th>{ "Status" }</th>
                                        <th>{ "Last update" }</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { for swap_list.iter().map(|item| html! {
                                        <tr>
                                            <td>{ &item.swap_id }</td>
                                            <td>{ &item.phase }</td>
                                            <td>{ &item.status }</td>
                                            <td>{ &item.last_update }</td>
                                        </tr>
                                    }) }
                                </tbody>
                            </table>
                        }
                    } }
                </div>
            </div>
        </div>
    }
}

#[wasm_bindgen(start)]
pub fn run_app() {
    log!("Starting Fiber RGB++ Swap frontend");
    yew::start_app::<App>();
}
