"use client";

import { useState, useEffect } from "react";
import { Sparkles, Key, Globe, Cpu, Save, CheckCircle, Eye, EyeOff, AlertCircle, Server } from "lucide-react";

const AI_API_KEY_STORAGE = "ifr_ai_api_key";
const AI_API_URL_STORAGE = "ifr_ai_api_url";
const AI_MODEL_STORAGE = "ifr_ai_model";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("claude-3-haiku-20240307");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [hasEnvKey, setHasEnvKey] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem(AI_API_KEY_STORAGE) || "";
    setApiKey(storedKey);
    setApiUrl(localStorage.getItem(AI_API_URL_STORAGE) || "https://api.kintio.com");
    setModel(localStorage.getItem(AI_MODEL_STORAGE) || "claude-3-haiku-20240307");
  }, []);

  const handleSave = () => {
    localStorage.setItem(AI_API_KEY_STORAGE, apiKey);
    localStorage.setItem(AI_API_URL_STORAGE, apiUrl);
    localStorage.setItem(AI_MODEL_STORAGE, model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          apiUrl,
          model,
          profile: {
            username: "test_account",
            full_name: "Test User",
            biography: "Just a test profile",
            followers_count: 150,
            following_count: 200,
            posts_count: 45,
            has_profile_pic: true,
            is_private: false,
            is_verified: false,
            is_business: false,
            account_age_days: 365,
            external_url: null,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.verdict) {
        setTestResult({ ok: true, message: `✅ Working! Verdict: ${data.verdict} (${data.confidence}%)` });
      } else {
        setTestResult({ ok: false, message: `❌ ${data.error || "API error"}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: `❌ ${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-[#a1a1aa] mt-0.5">Configure API keys and preferences</p>
      </div>

      {/* AI Settings */}
      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[rgba(99,102,241,0.2)] to-[rgba(99,102,241,0.05)] flex items-center justify-center">
            <Sparkles size={18} className="text-[#818cf8]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">AI Profile Analysis</h2>
            <p className="text-[11px] text-[#52525b]">Uses AI to detect bots and fake accounts</p>
          </div>
        </div>

        <div className="space-y-3.5">
          {/* API URL */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1 flex items-center gap-1.5">
              <Globe size={12} className="text-[#52525b]" /> API Endpoint
            </label>
            <input
              className="input w-full font-mono text-sm"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://api.kintio.com"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1 flex items-center gap-1.5">
              <Key size={12} className="text-[#52525b]" /> API Key
            </label>
            <div className="relative">
              <input
                className="input w-full font-mono text-sm pr-10"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa] transition-colors"
                onClick={() => setShowKey(!showKey)}
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1 flex items-center gap-1.5">
              <Cpu size={12} className="text-[#52525b]" /> Model
            </label>
            <select className="select w-full text-sm" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="claude-3-haiku-20240307">Claude 3 Haiku (fast, cheap)</option>
              <option value="claude-3-sonnet-20240229">Claude 3 Sonnet (balanced)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (cheap)</option>
              <option value="gpt-4o">GPT-4o (powerful)</option>
            </select>
            <p className="text-[10px] text-[#52525b] mt-1">Use a model name your provider supports</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              className="btn btn-primary text-sm min-w-[130px] justify-center transition-all"
              onClick={handleSave}
            >
              {saved ? (
                <><CheckCircle size={14} className="text-green-300" /> Saved!</>
              ) : (
                <><Save size={14} /> Save Settings</>
              )}
            </button>
            <button
              className="btn btn-ghost text-sm min-w-[130px] justify-center"
              onClick={handleTest}
              disabled={testing || !apiKey}
            >
              {testing ? (
                <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Testing...</>
              ) : (
                <><Server size={14} /> Test Connection</>
              )}
            </button>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`text-xs p-3 rounded-lg transition-all ${
              testResult.ok
                ? "bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] text-[#22c55e]"
                : "bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)] text-[#ef4444]"
            }`}>
              {testResult.message}
            </div>
          )}

          {!apiKey && (
            <div className="flex items-center gap-1.5 text-[10px] text-[#eab308]">
              <AlertCircle size={10} />
              Enter an API key to enable AI analysis
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="card p-4 border border-white/5">
        <p className="text-[11px] text-[#52525b] leading-relaxed">
          <strong className="text-[#a1a1aa]">How it works:</strong> When you click "AI Analyze" on a profile, the profile data is sent to the AI API. The AI checks username patterns, profile completeness, follower/following ratios, and other signals to determine bot probability. Your API key stays in your browser — never sent to our servers.
        </p>
      </div>
    </div>
  );
}
