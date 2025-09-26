import React, { useEffect, useState } from 'react';
import API from './api';

export default function App(){
  const [accounts, setAccounts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [text, setText] = useState('');

  useEffect(()=>{ fetchAccounts(); fetchMessages(); const ws = new WebSocket('ws://localhost:3001/ws'); ws.onmessage = e => { const data = JSON.parse(e.data); if (data.type === 'message' || data.type === 'out') fetchMessages(); }; return ()=> ws.close(); }, []);

  async function fetchAccounts(){ const res = await API.get('/api/accounts'); setAccounts(res.data); if (res.data[0]) setSelectedAccount(res.data[0].id); }
  async function fetchMessages(){ const res = await API.get('/api/messages'); setMessages(res.data); }
  async function send(){ if (!selectedAccount) return alert('selecione conta'); const to = prompt('Número destino (com DDI, ex: 55119xxxx)'); if (!to) return; await API.post('/api/send', { account_id: selectedAccount, to, text }); setText(''); }

  return (
    <div className="app">
      <aside className="sidebar">
        <h3>Contas</h3>
        <ul>
          {accounts.map(a=> <li key={a.id} className={selectedAccount===a.id? 'sel':''} onClick={()=>setSelectedAccount(a.id)}>{a.name} ({a.provider})</li>)}
        </ul>
      </aside>
      <main className="main">
        <h2>Inbox</h2>
        <div className="messages">
          {messages.map(m=> (
            <div key={m.id} className={m.direction==='in'? 'in':'out'}>
              <div className="meta">{m.from_number} → {m.to_number} — {new Date(m.ts).toLocaleString()}</div>
              <div className="text">{m.text}</div>
            </div>
          ))}
        </div>
        <div className="composer">
          <input value={text} onChange={e=>setText(e.target.value)} placeholder="Mensagem..." />
          <button onClick={send}>Enviar (como conta selecionada)</button>
        </div>
      </main>
    </div>
  );
}
