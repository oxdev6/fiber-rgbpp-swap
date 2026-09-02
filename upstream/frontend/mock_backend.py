#!/usr/bin/env python3
import http.server
import socketserver
import json
import uuid
from urllib.parse import urlparse
from datetime import datetime

PORT = 8080

SWAPS_FILE = 'frontend/mock_swaps.json'

try:
    with open(SWAPS_FILE, 'r') as f:
        SWAPS = json.load(f)
except Exception:
    SWAPS = {}

def persist():
    with open(SWAPS_FILE, 'w') as f:
        json.dump(SWAPS, f, indent=2)

class Handler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, obj, code=200):
        data = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == '/api/health':
            self._send_json({'status':'ok'})
            return
        if path == '/api/swap':
            items = []
            for sid, s in SWAPS.items():
                items.append({
                    'swap_id': sid,
                    'phase': s.get('phase'),
                    'status': s.get('status'),
                    'last_update': s.get('last_update'),
                })
            self._send_json(items)
            return
        if path.startswith('/api/swap/'):
            parts = path.split('/')
            if len(parts) >= 3:
                sid = parts[3-1] if len(parts) >= 3 else ''
            else:
                sid = ''
            # handle /api/swap/{id}/raw
            if path.endswith('/raw'):
                sid = parts[3]
                s = SWAPS.get(sid)
                if not s:
                    self._send_json({'error':'Swap not found'}, 404)
                    return
                self._send_json({'swap_id': sid, 'funding_tx_raw': s.get('funding_tx_raw'), 'leap_tx_raw': s.get('leap_tx_raw')})
                return
            # /api/swap/{id}
            sid = parts[2] if len(parts) >= 3 else ''
            s = SWAPS.get(sid)
            if not s:
                self._send_json({'error':'Swap not found'}, 404)
                return
            # simulate progression: bump stage on each status GET
            stage = s.get('stage', 0)
            if stage == 0:
                s['status'] = 'Funding transaction submitted; awaiting RGB++ leap'
                s['phase'] = 'leap'
                s['stage'] = 1
            elif stage == 1:
                s['status'] = 'Asset leap prepared and ready for final settlement'
                s['phase'] = 'completed'
                s['stage'] = 2
            else:
                s['status'] = 'Swap completed. Verify on-chain transactions and settle.'
            s['last_update'] = 'Updated at ' + datetime.utcnow().isoformat()
            persist()
            resp = {
                'swap_id': sid,
                'status': s.get('status'),
                'phase': s.get('phase'),
                'funding_tx_hash': s.get('funding_tx_hash'),
                'leap_tx_hash': s.get('leap_tx_hash'),
                'funding_tx_raw': s.get('funding_tx_raw'),
                'leap_tx_raw': s.get('leap_tx_raw'),
                'verification_command': s.get('verification_command'),
                'last_update': s.get('last_update'),
            }
            self._send_json(resp)
            return
        # Fallback to file server for other paths
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if self.path == '/api/swap/initiate':
            length = int(self.headers.get('Content-Length','0'))
            body = self.rfile.read(length) if length > 0 else b'{}'
            try:
                req = json.loads(body.decode('utf-8'))
            except Exception:
                req = {}
            # minimal validation
            if not req.get('offerer_address') or not req.get('counterparty_address'):
                self._send_json({'error':'addresses required'}, 400)
                return
            sid = str(uuid.uuid4())
            # create dummy txs
            funding = {'tx': 'funding_dummy', 'offerer': req.get('offerer_address'), 'amount': req.get('amount',0)}
            leap = {'tx': 'leap_dummy', 'counterparty': req.get('counterparty_address'), 'amount': req.get('amount',0)}
            funding_raw = json.dumps(funding)
            leap_raw = json.dumps(leap)
            funding_hash = '0x' + uuid.uuid4().hex
            leap_hash = '0x' + uuid.uuid4().hex
            verification_command = f"ckb-cli rpc get_transaction {funding_hash} && ckb-cli rpc get_transaction {leap_hash}"
            now = 'Swap created at ' + datetime.utcnow().isoformat()
            SWAPS[sid] = {
                'request': req,
                'status': 'Funding transaction prepared',
                'phase': 'funding',
                'stage': 0,
                'funding_tx_hash': funding_hash,
                'leap_tx_hash': leap_hash,
                'funding_tx_raw': funding_raw,
                'leap_tx_raw': leap_raw,
                'verification_command': verification_command,
                'last_update': now,
            }
            persist()
            resp = {
                'swap_id': sid,
                'message': 'Swap initialized successfully',
                'next_step': 'Submit funding transaction and then perform the RGB++ leap.',
                'phase': 'funding',
                'funding_tx_hash': funding_hash,
                'leap_tx_hash': leap_hash,
                'funding_tx_raw': funding_raw,
                'leap_tx_raw': leap_raw,
                'verification_command': verification_command,
                'last_update': now,
            }
            self._send_json(resp, 200)
            return
        # otherwise 404
        self._send_json({'error':'not found'}, 404)

if __name__ == '__main__':
    print(f"Starting mock backend on http://127.0.0.1:{PORT}")
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('Shutting down')