"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Plus, UsersRound } from "lucide-react";
import { acceptFamilyInvitation, createFamilyChild, inviteFamilyGuardian, respondFamilyEvent } from "@/app/familie/actions";
import { familyTaskCount, type FamilyChild, type FamilyOverview, type FamilyResult } from "@/domain/family";
import { useI18n } from "@/i18n/i18n-provider";
import { familyCopy } from "./family-copy";
import styles from "./family-view.module.css";

/** Pro Kind ein eigener Bereich: Antworten sind nie an das Elternprofil gebunden. */
export function FamilyView({ initial, invitationToken = "", invitationName = null }: {
  initial: FamilyOverview | null; invitationToken?: string; invitationName?: string | null;
}) {
  const { locale } = useI18n();
  const copy = familyCopy(locale);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [childId, setChildId] = useState("");
  const [result, setResult] = useState<FamilyResult | null>(null);
  const [pending, startTransition] = useTransition();
  const totalTasks = initial?.children.reduce((sum, child) => sum + familyTaskCount(child), 0) || 0;

  function run(action: () => Promise<FamilyResult>, done?: () => void) {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await action();
        setResult(response);
        if (response.ok) { done?.(); router.refresh(); }
      } catch { setResult({ ok: false, code: "failed" }); }
    });
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}><UsersRound size={18} /> Trainer Hub</p><h1>{copy.title}</h1><p>{copy.intro}</p></div>
      <button className={styles.primary} onClick={() => { setChildId(crypto.randomUUID()); setAdding(true); }} disabled={pending}>
        <Plus size={18} />{copy.add}
      </button>
    </header>
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? styles.success : styles.error}>{copy[result.code]}</p>}
    {invitationToken && <section className={styles.panel} aria-labelledby="family-invitation-heading">
      <h2 id="family-invitation-heading">{copy.acceptTitle}</h2>
      {invitationName ? <><p>{copy.acceptHelp}</p><strong>{invitationName}</strong>
        <form action={data => run(() => acceptFamilyInvitation(invitationToken, data.get("declaration") === "on"), () => router.replace("/familie"))}>
          <label className={styles.checkbox}><input type="checkbox" name="declaration" required />{copy.declaration}</label>
          <button className={styles.primary} disabled={pending}>{pending ? copy.working : copy.accept}</button>
        </form></> : <p role="alert">{copy.linkInvalid}</p>}
    </section>}
    {adding && <section className={styles.panel} aria-labelledby="family-create-heading">
      <h2 id="family-create-heading">{copy.add}</h2><p>{copy.createHelp}</p>
      <form action={data => run(() => createFamilyChild(childId, String(data.get("name") || ""), data.get("declaration") === "on"), () => setAdding(false))}>
        <label className={styles.field}>{copy.name}<input name="name" minLength={2} maxLength={120} required autoComplete="off" /></label>
        <label className={styles.checkbox}><input type="checkbox" name="declaration" required />{copy.declaration}</label>
        <div className={styles.actions}><button className={styles.primary} disabled={pending}>{pending ? copy.working : copy.submit}</button>
          <button type="button" disabled={pending} onClick={() => setAdding(false)}>{copy.cancel}</button></div>
      </form>
    </section>}
    {Boolean(initial?.notifications?.length) && <section className={styles.panel} aria-label={locale === "en" ? "Updates from your children" : "Neuigkeiten deiner Kinder"}>
      <h2>{locale === "en" ? "Updates from your children" : "Neuigkeiten deiner Kinder"}</h2>
      {initial?.notifications?.map(notice => <p key={notice.id}><strong>{notice.title}</strong><br />{notice.message}</p>)}
    </section>}
    {!initial ? <section className={styles.panel}><p role="alert">{copy.loadError}</p><button onClick={() => router.refresh()}>{copy.refresh}</button></section>
      : initial.children.length === 0 ? <section className={`${styles.panel} ${styles.empty}`}><UsersRound size={36} /><h2>{copy.empty}</h2><p>{copy.emptyText}</p></section>
      : <><p className={styles.summary}><strong>{totalTasks}</strong> {copy.tasks}</p><div className={styles.children}>
        {initial.children.map(child => <ChildCard key={child.id} child={child} />)}
      </div></>}
  </div>;
}

function ChildCard({ child }: { child: FamilyChild }) {
  const { locale } = useI18n();
  const copy = familyCopy(locale);
  const router = useRouter();
  const [result, setResult] = useState<FamilyResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [invitationUrl, setInvitationUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin",
  }).format(new Date(value));
  function run(action: () => Promise<FamilyResult>) {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await action(); setResult(response);
        if (response.invitationToken) {
          const url = new URL("/familie", window.location.origin);
          url.searchParams.set("einladung", response.invitationToken);
          setInvitationUrl(url.toString()); setCopied(false);
        }
        if (response.ok || response.code === "conflict") router.refresh();
      } catch { setResult({ ok: false, code: "failed" }); }
    });
  }
  return <section className={styles.child} aria-labelledby={`child-${child.id}`}>
    <header className={styles.childHeader}><div className={styles.avatar} aria-hidden="true">{child.name.slice(0,1).toUpperCase()}</div>
      <div><h2 id={`child-${child.id}`}>{child.name}</h2><span>{child.hasLogin ? copy.login : copy.noLogin}</span></div>
      <span className={styles.taskBadge}>{familyTaskCount(child)} {copy.tasks}</span>
    </header>
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? styles.success : styles.error}>{copy[result.code]}</p>}
    <div className={styles.events}>
      {child.events.length === 0 && <p className={styles.quiet}>{copy.noEvents}</p>}
      {child.events.map(event => <article key={event.id} className={styles.event}>
        <div className={styles.eventTop}><CalendarDays size={18} /><time dateTime={event.startsAt}>{date(event.startsAt)}</time></div>
        <h3>{event.title}</h3><p>{event.location}</p>
        <span className={styles.status}>{event.status === "cancelled" ? copy.cancelled : event.attendance ? copy[event.attendance] : copy.noResponse}</span>
        {event.deadline && <p className={styles.detail}>{copy.deadline}: {date(event.deadline)}</p>}
        {event.late && <p className={styles.detail}>{copy.late}</p>}
        {event.status === "scheduled" && <div className={styles.actions}>
          <button className={event.attendance === "confirmed" ? styles.selected : ""} disabled={pending || event.attendance === "confirmed"}
            onClick={() => run(() => respondFamilyEvent(child.id,event.id,"confirmed",event.revision,event.responseAt))}>
            {event.attendance === "confirmed" && <Check size={16} />}{copy.yes}</button>
          <button className={event.attendance === "declined" ? styles.selected : ""} disabled={pending || event.attendance === "declined"}
            onClick={() => run(() => respondFamilyEvent(child.id,event.id,"declined",event.revision,event.responseAt))}>{copy.no}</button>
        </div>}
        {event.needsAcknowledgement && <div className={styles.change}><p>{copy.changed}</p>
          <button disabled={pending} onClick={() => run(() => respondFamilyEvent(child.id,event.id,null,event.revision,event.responseAt,true))}>{copy.acknowledge}</button>
        </div>}
      </article>)}
    </div>
    {!child.hasLogin && <details className={styles.invite}><summary>{copy.invite}</summary>
      <form action={data => { setInvitationUrl(""); run(() => inviteFamilyGuardian(child.id, String(data.get("email") || ""))); }}>
        <label className={styles.field}>{copy.email}<input type="email" name="email" maxLength={320} required autoComplete="off" /></label>
        <button disabled={pending}>{pending ? copy.working : copy.createLink}</button>
      </form>
      {invitationUrl && <div><p>{copy.linkHelp}</p><input aria-label={copy.createLink} readOnly value={invitationUrl} onFocus={event => event.target.select()} />
        <button onClick={async () => { try { await navigator.clipboard.writeText(invitationUrl); setCopied(true); } catch { setCopied(false); } }}>{copied ? copy.copied : copy.copy}</button>
      </div>}
    </details>}
  </section>;
}
