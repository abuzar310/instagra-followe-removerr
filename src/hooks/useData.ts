"use client";

import { useState, useEffect, useCallback } from "react";
import type { Follower, Rule, ReviewFilters, DashboardStats, ImportBatch } from "@/lib/types";
import {
  getFollowers, updateFollower, deleteFollowers,
  getRules, saveRules, resetRules,
  getBatches, importFollowers, clearAll, scoreAll, getDashboardStats, applyFilters, getDefaultFilters,
} from "@/lib/store";

export function useData() {
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setFollowers(getFollowers());
    setRules(getRules());
    setBatches(getBatches());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const doScoreAll = useCallback(() => {
    const scored = scoreAll(rules);
    setFollowers(scored);
  }, [rules]);

  const doUpdateFollower = useCallback((id: string, patch: Partial<Follower>) => {
    const updated = updateFollower(id, patch);
    setFollowers(updated);
  }, []);

  const doDeleteFollowers = useCallback((ids: string[]) => {
    const remaining = deleteFollowers(ids);
    setFollowers(remaining);
  }, []);

  const doImport = useCallback((raw: Record<string, any>[], filename: string) => {
    const result = importFollowers(raw, filename);
    refresh();
    return result;
  }, [refresh]);

  const doSaveRules = useCallback((r: Rule[]) => {
    saveRules(r);
    setRules(r);
    const scored = scoreAll(r);
    setFollowers(scored);
  }, []);

  const doResetRules = useCallback(() => {
    resetRules();
    setRules(getRules());
    const scored = scoreAll();
    setFollowers(scored);
  }, []);

  const doClearAll = useCallback(() => {
    clearAll();
    refresh();
  }, [refresh]);

  const stats: DashboardStats = getDashboardStats(followers);

  return {
    followers, rules, batches, loading, stats,
    scoreAll: doScoreAll,
    updateFollower: doUpdateFollower,
    deleteFollowers: doDeleteFollowers,
    importFollowers: doImport,
    saveRules: doSaveRules,
    resetRules: doResetRules,
    clearAll: doClearAll,
    refresh,
  };
}
