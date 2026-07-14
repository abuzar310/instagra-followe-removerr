"use client";

import { useState } from "react";
import { useData } from "@/hooks/useData";
import { v4 as uuid } from "uuid";
import type { Rule, RuleField, RuleOperator } from "@/lib/types";
import { SlidersHorizontal, RotateCcw, Plus, X, AlertCircle } from "lucide-react";

const FIELD_OPTIONS: { value: RuleField; label: string }[] = [
  { value: "followers_count", label: "Followers" },
  { value: "following_count", label: "Following" },
  { value: "posts_count", label: "Posts" },
  { value: "has_profile_pic", label: "Has Profile Picture" },
  { value: "is_private", label: "Private Account" },
  { value: "is_verified", label: "Verified Account" },
  { value: "is_business", label: "Business Account" },
  { value: "username", label: "Username" },
  { value: "full_name", label: "Full Name" },
  { value: "biography", label: "Biography" },
  { value: "account_age_days", label: "Account Age (days)" },
  { value: "followers_following_ratio", label: "Followers / Following Ratio" },
  { value: "username_digit_count", label: "Digits in Username" },
];

const OPERATOR_OPTIONS: { value: RuleOperator; label: string; type: "num" | "str" | "bool" }[] = [
  { value: "gt", label: "Greater than (>", type: "num" },
  { value: "lt", label: "Less than (<", type: "num" },
  { value: "eq", label: "Equals (=)", type: "num" },
  { value: "neq", label: "Not equals (≠)", type: "num" },
  { value: "contains", label: "Contains", type: "str" },
  { value: "not_contains", label: "Does not contain", type: "str" },
  { value: "is_true", label: "Is true", type: "bool" },
  { value: "is_false", label: "Is false", type: "bool" },
];

const NUMERIC_FIELDS = new Set<RuleField>([
  "followers_count", "following_count", "posts_count",
  "account_age_days", "followers_following_ratio", "username_digit_count",
]);
const BOOL_FIELDS = new Set<RuleField>(["has_profile_pic", "is_private", "is_verified", "is_business"]);

function getOpsForField(field: RuleField): RuleOperator[] {
  if (NUMERIC_FIELDS.has(field)) return ["gt", "lt", "eq", "neq"];
  if (BOOL_FIELDS.has(field)) return ["is_true", "is_false"];
  return ["contains", "not_contains"];
}

export default function RulesPage() {
  const { rules, saveRules, resetRules } = useData();
  const [showEditor, setShowEditor] = useState(false);

  const handleToggle = (id: string) => {
    const updated = rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    );
    saveRules(updated);
  };

  const handlePoints = (id: string, points: number) => {
    const updated = rules.map((r) =>
      r.id === id ? { ...r, points: Math.max(1, Math.min(100, points)) } : r
    );
    saveRules(updated);
  };

  const handleDelete = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    saveRules(updated);
  };

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Suspicion Rules</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            {activeCount} of {rules.length} rules active
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost text-sm" onClick={resetRules}>
            <RotateCcw size={14} /> Reset Defaults
          </button>
          <button className="btn btn-primary text-sm" onClick={() => setShowEditor(!showEditor)}>
            <Plus size={14} /> {showEditor ? "Cancel" : "New Rule"}
          </button>
        </div>
      </div>

      {/* New Rule Editor */}
      {showEditor && (
        <NewRuleForm onSave={() => setShowEditor(false)} />
      )}

      {/* Info card */}
      <div className="card p-4">
        <p className="text-sm text-[#a1a1aa] leading-relaxed">
          Rules check each profile and assign suspicion points. Profiles scoring <strong className="text-white">30+</strong> are flagged, <strong className="text-white">60+</strong> are high risk. Adjust point values to control how much each rule contributes.
        </p>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="card p-12 text-center">
          <SlidersHorizontal size={36} className="mx-auto mb-3 text-[#27272a]" />
          <p className="text-sm text-[#52525b]">No rules defined.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const opLabel = OPERATOR_OPTIONS.find((o) => o.value === rule.operator)?.label || rule.operator;
            const fieldLabel = FIELD_OPTIONS.find((f) => f.value === rule.field)?.label || rule.field;
            return (
              <div key={rule.id} className="card p-4 flex items-center gap-4">
                {/* Toggle */}
                <button
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    rule.enabled ? "bg-[#6366f1]" : "bg-[#27272a]"
                  }`}
                  onClick={() => handleToggle(rule.id)}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      rule.enabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{rule.name}</div>
                  <div className="text-xs text-[#52525b] mt-0.5 font-mono">
                    {fieldLabel} {opLabel} {rule.value || "—"}
                    {!rule.enabled && <span className="ml-2 text-[#52525b] italic">(disabled)</span>}
                  </div>
                </div>

                {/* Points slider */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-[#52525b] font-mono">Pts</span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={rule.points}
                    onChange={(e) => handlePoints(rule.id, parseInt(e.target.value))}
                    className="w-20 accent-[#6366f1]"
                  />
                  <span className="text-sm font-mono font-semibold text-white/70 w-6 text-right">
                    {rule.points}
                  </span>
                </div>

                {/* Badge */}
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: rule.color || "#6366f1" }} />

                {/* Delete */}
                <button className="btn btn-ghost btn-sm p-1.5" onClick={() => handleDelete(rule.id)} title="Delete">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewRuleForm({ onSave }: { onSave: () => void }) {
  const { rules, saveRules } = useData();
  const [name, setName] = useState("");
  const [field, setField] = useState<RuleField>("followers_count");
  const [operator, setOperator] = useState<RuleOperator>("gt");
  const [value, setValue] = useState("");
  const [points, setPoints] = useState(15);
  const [error, setError] = useState("");

  const availableOps = getOpsForField(field);
  // Reset operator if current one not available
  if (!availableOps.includes(operator) && availableOps.length > 0) {
    // handled via handleFieldChange
  }

  const handleFieldChange = (f: RuleField) => {
    setField(f);
    const ops = getOpsForField(f);
    if (!ops.includes(operator)) setOperator(ops[0]);
  };

  const handleSave = () => {
    if (!name.trim()) { setError("Give the rule a name."); return; }
    const isBool = operator === "is_true" || operator === "is_false";

    const newRule: Rule = {
      id: uuid(),
      name: name.trim(),
      field,
      operator,
      value: isBool ? "" : value,
      points,
      enabled: true,
    };
    saveRules([...rules, newRule]);
    onSave();
  };

  const isBool = operator === "is_true" || operator === "is_false";

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-white/80 mb-4">New Rule</h3>
      {error && (
        <div className="flex items-center gap-2 text-sm text-[#ef4444] mb-3">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1">Name</label>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High following" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1">Field</label>
          <select className="select w-full" value={field} onChange={(e) => handleFieldChange(e.target.value as RuleField)}>
            {FIELD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1">Operator</label>
          <select className="select w-full" value={operator} onChange={(e) => setOperator(e.target.value as RuleOperator)}>
            {availableOps.map((op) => (
              <option key={op} value={op}>{OPERATOR_OPTIONS.find((o) => o.value === op)?.label || op}</option>
            ))}
          </select>
        </div>
        {!isBool && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1">Value</label>
            <input
              className="input w-full"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={NUMERIC_FIELDS.has(field) ? "e.g. 2000" : "e.g. bot"}
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1">Points</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={50}
              value={points}
              onChange={(e) => setPoints(parseInt(e.target.value))}
              className="flex-1 accent-[#6366f1]"
            />
            <span className="text-sm font-mono font-semibold text-white w-6 text-right">{points}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={handleSave}>
          <Plus size={14} /> Add Rule
        </button>
        <button className="btn btn-ghost" onClick={onSave}>Cancel</button>
      </div>
    </div>
  );
}
