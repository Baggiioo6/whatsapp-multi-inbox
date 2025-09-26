import express from 'express';
import bodyParser from 'body-parser';
import Database from 'better-sqlite3';
import axios from 'axios';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'verify_token_example';

const db = new Database('./whatsapp.db');
db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  provider TEXT,
  token TEXT,
  phone_number_id TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  from_number TEXT,
  to_number TEXT,
  text TEXT,
  direction TEXT,
  ts INTEGER
);
`);

// WebSocket server (for frontend realtime)
const server = app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});
const clients = new Set();
wss.on('connection', ws => { clients.add(ws); ws.on('close', () => clients.delete(ws)); });
function broadcast(payload){ for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify(payload)); }

// Verification endpoint for Meta webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// Webhook receiver
app.post('/webhook', (req, res) => {
  try {
    const body = req.body;
    if (body.entry) {
      for (const entry of body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            const val = change.value;
            if (val.messages) {
              for (const msg of val.messages) {
                const from = msg.from;
                const text = msg.text?.body || '';
                const account = db.prepare('SELECT * FROM accounts WHERE phone_number_id = ?').get(val.metadata?.phone_number_id || val.phone_number_id);
                const account_id = account ? account.id : null;
                db.prepare('INSERT INTO messages (account_id,from_number,to_number,text,direction,ts) VALUES (?,?,?,?,?,?)')
                  .run(account_id, from, account?.phone_number_id || null, text, 'in', Date.now());
                broadcast({ type: 'message', account_id, from, text });
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('webhook error', e);
  }
  res.sendStatus(200);
});

// Admin: add account
app.post('/api/accounts', (req, res) => {
  const { name, provider, token, phone_number_id } = req.body;
  const st = db.prepare('INSERT INTO accounts (name,provider,token,phone_number_id) VALUES (?,?,?,?)');
  const info = st.run(name, provider, token, phone_number_id);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// List accounts
app.get('/api/accounts', (req, res) => {
  const rows = db.prepare('SELECT * FROM accounts').all();
  res.json(rows);
});

// List messages
app.get('/api/messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY ts DESC LIMIT 200').all();
  res.json(rows);
});

// Send message using stored account
async function sendViaMeta(phone_number_id, token, to, text){
  const url = `https://graph.facebook.com/v17.0/${phone_number_id}/messages`;
  return axios.post(url, { messaging_product: 'whatsapp', to, text: { body: text } }, { headers: { Authorization: `Bearer ${token}` } });
}

app.post('/api/send', async (req, res) => {
  try {
    const { account_id, to, text } = req.body;
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account) return res.status(404).json({ error: 'account not found' });
    if (account.provider === 'meta') await sendViaMeta(account.phone_number_id, account.token, to, text);
    db.prepare('INSERT INTO messages (account_id,from_number,to_number,text,direction,ts) VALUES (?,?,?,?,?,?)')
      .run(account_id, account.phone_number_id, to, text, 'out', Date.now());
    broadcast({ type: 'out', account_id, to, text });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Simple bridge rule: forward inbound messages of one account to another account (opt-in via query)
app.post('/api/bridge', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, message } = req.body;
    const src = db.prepare('SELECT * FROM accounts WHERE id = ?').get(fromAccountId);
    const dst = db.prepare('SELECT * FROM accounts WHERE id = ?').get(toAccountId);
    if (!src || !dst) return res.status(404).json({ error: 'account not found' });
    if (dst.provider === 'meta') await sendViaMeta(dst.phone_number_id, dst.token, message, src.phone_number_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default app;
