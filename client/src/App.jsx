import { useState } from 'react';
import ContactsPage from './pages/ContactsPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import ScriptsPage from './pages/ScriptsPage.jsx';

const TABS = [
  { key: 'contacts', label: 'リスト' },
  { key: 'history', label: '履歴' },
  { key: 'scripts', label: 'スクリプト' },
];

export default function App() {
  const [tab, setTab] = useState('contacts');

  return (
    <div className="app">
      <header className="topbar">
        <h1>AIテレアポツール</h1>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'contacts' && <ContactsPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'scripts' && <ScriptsPage />}
      </main>
    </div>
  );
}
