import { useState } from 'react';
import { Monitor, Moon, Sun, Check } from 'lucide-react';
import BackButton from '../../components/common/BackButton.tsx';
import { getTheme, setTheme, type Theme } from '../../store/themeStore.ts';

interface ThemeOption {
  value: Theme;
  label: string;
  desc:  string;
  Icon:  React.ElementType;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light',  label: 'Light',  desc: 'Always use light mode',           Icon: Sun     },
  { value: 'dark',   label: 'Dark',   desc: 'Always use dark mode',            Icon: Moon    },
  { value: 'system', label: 'System', desc: 'Follow your device preference',   Icon: Monitor },
];

export default function Settings() {
  const [current, setCurrent] = useState<Theme>(getTheme);

  function handleTheme(t: Theme) {
    setTheme(t);
    setCurrent(t);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your app preferences</p>
        </div>
      </header>

      {/* ── Appearance ── */}
      <section className="card settings-section">
        <h2 className="card-title settings-section-title">Appearance</h2>
        <p className="settings-section-desc">Choose how Plivio looks to you</p>

        <div className="theme-options">
          {THEME_OPTIONS.map(({ value, label, desc, Icon }) => {
            const active = current === value;
            return (
              <button
                key={value}
                className={`theme-option${active ? ' theme-option--active' : ''}`}
                onClick={() => handleTheme(value)}
              >
                <span className={`theme-option-icon${active ? ' theme-option-icon--active' : ''}`}>
                  <Icon size={22} />
                </span>
                <div className="theme-option-body">
                  <span className="theme-option-label">{label}</span>
                  <span className="theme-option-desc">{desc}</span>
                </div>
                <span className={`theme-option-check${active ? ' theme-option-check--active' : ''}`}>
                  {active && <Check size={16} />}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
