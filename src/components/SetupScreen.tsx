import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

interface SetupScreenProps {
  onCompleteSetup: (password: string, includeStarterCatalog: boolean) => void;
}

export function SetupScreen({ onCompleteSetup }: SetupScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [includeStarter, setIncludeStarter] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    onCompleteSetup(password, includeStarter);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Create Administrator Password
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              BazarPOS · Offline Retail Security Setup
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
          Protect sensitive POS actions (item removals, discounts, stock edits, 3-day exchanges, and database restores) with an administrator password stored as a salted cryptographic hash.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="setup-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Administrator Password (min 4 chars)
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Create password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label htmlFor="setup-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Confirm Password
            </label>
            <input
              id="setup-confirm"
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError('');
              }}
              placeholder="Re-enter password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeStarter}
              onChange={(e) => setIncludeStarter(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Initialize with 5 sample retail products, 2 vendors, and 3 categories for immediate POS barcode testing (actual sales and reports remain ৳0.00 until you sell).
            </span>
          </label>

          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors"
          >
            <ShieldCheck className="h-4 w-4" />
            Save Password & Launch POS
          </button>
        </form>
      </div>
    </div>
  );
}
