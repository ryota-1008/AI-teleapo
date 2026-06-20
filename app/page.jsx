'use client';
import { useState } from 'react';
import { List, History, FileText, MessageSquare, Settings, PhoneCall } from 'lucide-react';
import ContactsPage from '@/components/ContactsPage';
import HistoryPage from '@/components/HistoryPage';
import ScriptsPage from '@/components/ScriptsPage';
import IndustryPitchesPage from '@/components/IndustryPitchesPage';
import SettingsPage from '@/components/SettingsPage';

const TABS = [
  { key: 'contacts', label: 'リスト', title: '架電リスト', icon: List },
  { key: 'history', label: '履歴', title: '架電履歴', icon: History },
  { key: 'scripts', label: 'スクリプト', title: 'トークスクリプト', icon: FileText },
  { key: 'industry', label: '業種トーク', title: '業種別トーク', icon: MessageSquare },
  { key: 'settings', label: '設定', title: '設定', icon: Settings },
];

export default function Home() {
  const [tab, setTab] = useState('contacts');
  const current = TABS.find((t) => t.key === tab);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><PhoneCall size={18} /></span>
          <div>
            <div className="brand-name">AIテレアポ</div>
            <div className="brand-sub">架電管理ツール</div>
          </div>
        </div>
        <nav className="nav">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} className={tab === t.key ? 'navitem active' : 'navitem'} onClick={() => setTab(t.key)}>
                <Icon size={17} aria-hidden="true" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="content">
        <header className="content-header">
          <h1>{current?.title}</h1>
        </header>
        <main>
          {tab === 'contacts' && <ContactsPage />}
          {tab === 'history' && <HistoryPage />}
          {tab === 'scripts' && <ScriptsPage />}
          {tab === 'industry' && <IndustryPitchesPage />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
