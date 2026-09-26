"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, Lock, Trash2, UserPlus } from "lucide-react";
import AppHeader from "../../components/AppHeader";
import { fetchAccount, redirectToLogin } from "../../lib/api";

interface Member {
  email: string;
  role: "member" | "admin";
  fixed: boolean;
  added_by: string | null;
  created_at: string | null;
}

const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (response.status === 401) redirectToLogin();
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "İşlem başarısız oldu.");
  return data as T;
}

/**
 * Ekip: sisteme girebilecek e-postalar (yalnizca yoneticiler).
 *
 * Listeye eklenen kisi Google hesabiyla ya da e-posta baglantisiyla
 * girebiliyor; listede olmayan hicbir yoldan giremiyor.
 */
export default function TeamPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("member");
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [emailLogin, setEmailLogin] = useState(false);

  const reload = useCallback(async () => {
    try {
      setMembers(await call<Member[]>("/api/team"));
    } catch (err: any) {
      setError(err?.message || "Liste okunamadı.");
    }
  }, []);

  useEffect(() => {
    reload();
    fetchAccount().then((a) => setEmailLogin(!!a?.emailLogin));
  }, [reload]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err: any) {
      setError(err?.message || "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    run(async () => {
      await call("/api/team", { method: "POST", body: JSON.stringify({ email, role }) });
      setEmail("");
      setRole("member");
    });
  };

  const changeRole = (target: Member, next: Member["role"]) =>
    run(() => call("/api/team", { method: "POST", body: JSON.stringify({ email: target.email, role: next }) }));

  const remove = (target: Member) =>
    run(async () => {
      await call(`/api/team?email=${encodeURIComponent(target.email)}`, { method: "DELETE" });
      setPendingRemove(null);
    });

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink-2">
      <AppHeader />

      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="font-display text-xl font-semibold text-ink">Ekip</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          Sisteme yalnızca bu listedeki e-postalar girebilir:{" "}
          {emailLogin ? "Google hesabıyla ya da e-postaya gelen bağlantıyla." : "Google hesabıyla (bu e-posta bir Google hesabı olmalı)."}{" "}
          Eklediğiniz kişiye site adresini iletmeniz yeterli. Listeden çıkarılan kişinin erişimi en geç bir
          dakikada kapanır.
        </p>

        <form onSubmit={add} className="mt-5 flex flex-wrap gap-2">
          <label htmlFor="team-email" className="sr-only">
            E-posta
          </label>
          <input
            id="team-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@eposta.com"
            className="min-w-0 flex-1 rounded-input border border-rule-2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-accent"
          />
          <label htmlFor="team-role" className="sr-only">
            Rol
          </label>
          <select
            id="team-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Member["role"])}
            className="rounded-input border border-rule-2 bg-paper px-2.5 py-2 text-sm text-ink hover:border-ink-4 focus:border-accent"
          >
            <option value="member">Üye</option>
            <option value="admin">Yönetici</option>
          </select>
          <button type="submit" disabled={busy || !email.trim()} className="btn btn--primary px-4 py-2 disabled:opacity-40">
            <UserPlus size={14} aria-hidden="true" />
            Ekle
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-critical">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="mt-6 overflow-hidden rounded-card border border-rule">
          {members === null ? (
            <p className="mono-label p-4">Yükleniyor</p>
          ) : (
            <ul>
              {members.map((m) => (
                <li key={m.email} className="flex flex-wrap items-center gap-3 rule-b px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.email}</p>
                    <p className="text-2xs text-ink-4">
                      {m.fixed
                        ? "Sabit yönetici (ortam ayarı)"
                        : `${m.created_at ? dateFormat.format(new Date(m.created_at)) : ""}${m.added_by ? ` · ekleyen ${m.added_by}` : ""}`}
                    </p>
                  </div>

                  {m.fixed ? (
                    <span className="inline-flex items-center gap-1 text-2xs text-ink-3">
                      <Lock size={11} aria-hidden="true" />
                      Yönetici
                    </span>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`role-${m.email}`}>
                        {m.email} rolü
                      </label>
                      <select
                        id={`role-${m.email}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => changeRole(m, e.target.value as Member["role"])}
                        className="rounded-input border border-rule-2 bg-paper px-2 py-1 text-xs text-ink"
                      >
                        <option value="member">Üye</option>
                        <option value="admin">Yönetici</option>
                      </select>
                      {pendingRemove === m.email ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => remove(m)}
                          className="rounded-input px-2 py-1 text-2xs font-medium text-critical hover:bg-paper-2"
                        >
                          Çıkar, onayla
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingRemove(m.email)}
                          aria-label={`${m.email} adresini listeden çıkar`}
                          className="rounded-input p-1.5 text-ink-4 transition-colors duration-fast ease-out hover:bg-paper-2 hover:text-critical"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
