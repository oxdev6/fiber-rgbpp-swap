#!/usr/bin/env bash
# Stop both Fiber nodes and the demo board. Keeps stores/keys (restart resumes).
set -u
pkill -f "target/debug/fnn -c" 2>/dev/null || true
pkill -f "http.server 8000" 2>/dev/null || true
sleep 2
LEFT=$(ps aux | grep -E "target/debug/fnn -c" | grep -v grep | wc -l)
echo "fnn processes left: $LEFT"
