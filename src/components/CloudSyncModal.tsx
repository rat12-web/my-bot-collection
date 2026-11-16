"use client";

import React, { useState } from "react";
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  X,
  RefreshCw,
  CheckCircle2,
  KeyRound,
  Copy,
} from "lucide-react";

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncKey: string;
  onSyncKeyChange: (key: string) => void;
  autoSync: boolean;
  onAutoSyncChange: (enabled: boolean) => void;
  lastSyncedAt: number | null;
  syncStatus: string | null;
  isSyncing: boolean;
  onPush: () => Promise<void>;
  onPull: () => Promise<void>;
}

export function CloudSyncModal({
  isOpen,
  onClose,
  syncKey,
  onSyncKeyChange,
  autoSync,
  onAutoSyncChange,
  lastSyncedAt,
  syncStatus,
  isSyncing,
  onPush,
  onPull,
}: CloudSyncModalProps) {
  const [draftKey, setDraftKey] = useState(syncKey);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  function generateRandomKey() {
    const rand = Math.random().toString(36).slice(2, 8);
    const next = `bot-${rand}-${Date.now().toString(36).slice(-4)}`;
    setDraftKey(next);
    onSyncKeyChange(next);
  }

  function applyDraftKey() {
    const cleaned = draftKey.trim();
    if (cleaned.length >= 3) {
      onSyncKeyChange(cleaned);
    }
  }

  async function copyShareLink() {
    if (!draftKey.trim()) return;
    const url = `${window.location.origin}/?sync=${encodeURIComponent(draftKey.trim())}`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="ซิงก์ข้อมูลข้ามเครื่อง (Cloud Sync)"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Cloud className="w-5 h-5 text-amber-500" />
            Cloud Sync ข้ามเครื่อง (มือถือ ↔ คอม)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง Cloud Sync"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          ตั้ง <strong>รหัสซิงก์ส่วนตัว (Sync Key)</strong> เพื่อบันทึกคลังการ์ดและเด็คทั้งหมดขึ้น
          Cloudflare D1 แล้วเปิดใช้งานต่อจากมือถือหรือคอมพิวเตอร์เครื่องอื่นได้ทันที
        </p>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
            รหัสซิงก์ส่วนตัว (อังกฤษ/ตัวเลข/-/_ อย่างน้อย 3 ตัว)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              data-testid="cloud-sync-key-input"
              placeholder="เช่น my-bot-vault-01"
              value={draftKey}
              onChange={(e) => {
                setDraftKey(e.target.value);
                if (/^[a-zA-Z0-9_-]{3,64}$/.test(e.target.value.trim())) {
                  onSyncKeyChange(e.target.value.trim());
                }
              }}
              onBlur={applyDraftKey}
              className="flex-1 px-3 py-2 rounded-xl text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={generateRandomKey}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              สุ่มรหัส
            </button>
          </div>
        </div>

        <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 cursor-pointer">
          <div>
            <div className="text-xs font-bold">ซิงก์อัตโนมัติ (Auto-Sync)</div>
            <div className="text-[11px] text-slate-500">
              บันทึกขึ้น Cloud อัตโนมัติหลังแก้ไขจำนวนการ์ดหรือเด็ค
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => onAutoSyncChange(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            data-testid="cloud-push-btn"
            disabled={isSyncing || draftKey.trim().length < 3}
            onClick={async () => {
              applyDraftKey();
              await onPush();
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 cursor-pointer"
          >
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CloudUpload className="w-4 h-4" />
            )}
            บันทึกขึ้น Cloud
          </button>

          <button
            type="button"
            data-testid="cloud-pull-btn"
            disabled={isSyncing || draftKey.trim().length < 3}
            onClick={async () => {
              applyDraftKey();
              await onPull();
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 cursor-pointer"
          >
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CloudDownload className="w-4 h-4" />
            )}
            ดึงจาก Cloud
          </button>
        </div>

        <button
          type="button"
          disabled={draftKey.trim().length < 3}
          onClick={copyShareLink}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5" />
          {copiedLink ? "คัดลอกลิงก์เปิดบนมือถือแล้ว!" : "คัดลอกลิงก์ซิงก์สำหรับเปิดบนมือถือ"}
        </button>

        {(syncStatus || lastSyncedAt) && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>
              {syncStatus && <div>{syncStatus}</div>}
              {lastSyncedAt && (
                <div className="text-[11px] opacity-80">
                  ซิงก์ล่าสุด:{" "}
                  {new Date(lastSyncedAt).toLocaleString("th-TH")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
