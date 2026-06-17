'use client';
import { useState } from 'react';
import ContactsPage from '@/components/ContactsPage';
import HistoryPage from '@/components/HistoryPage';
import ScriptsPage from '@/components/ScriptsPage';
import SettingsPage from '@/components/SettingsPage';

const TABS = [
  { key: 'contacts', label: 'リスト' },
  { key: 'history', label: '履歴' },
  { key: 'scripts', label: 'スクリプト' },
  { key: 'settings', label: '設定' },
];

export default function Home() {
  const [tab, setTab] = useState('contacts');

  return (
    <div className="app">
      <header className="topbar">
        <h1>AIテレアポツール</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'contacts' && <ContactsPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'scripts' && <ScriptsPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
