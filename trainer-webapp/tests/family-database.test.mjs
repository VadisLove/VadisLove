import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
// Ausschließlich synthetische Konten in einer isolierten PostgreSQL-Datenbank.
const P='00000000-0000-0000-0000-000000000004', Q='00000000-0000-0000-0000-000000000005', C='00000000-0000-0000-0000-000000000002', X='00000000-0000-0000-0000-000000000003', O='00000000-0000-0000-0000-000000000001';
let db;
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
const user=(id,fn)=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return fn(tx);});
const rpc=async(id,sql,args=[]) => (await user(id,tx=>tx.query(sql,args))).rows;
const create=async(parent,name='Kind',id=randomUUID())=>{await rpc(parent,'select public.family_create_child($1,$2,true)',[id,name]);return id;};
before(async()=>{
 db=new PGlite();
 await db.exec(await read('./fixtures/carpool-base.sql'));
 await db.exec(await read('../supabase/migrations/20260903080920_carpool_release.sql'));
 await db.exec(await read('./fixtures/calendar-communication-base.sql'));
 await db.exec(await read('../supabase/migrations/20260922122040_step_4_calendar_communication.sql'));
 // Bestehender Identitätsvertrag aus Schritt 5; die Familienmigration läuft unverändert.
 await db.exec(`create schema extensions;
 create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;
 create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex')$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table public.training_athletes(id uuid primary key default gen_random_uuid(),user_id uuid unique references public.profiles(id) on delete set null,display_name text not null,created_at timestamptz not null default now());
 alter table public.training_athletes enable row level security;
 grant select on public.training_athletes to authenticated;`);
 await db.query("insert into public.profiles(id,display_name,email) values($1,'Parent','parent@example.test'),($2,'Second','second@example.test'),($3,'Child','child@example.test'),($4,'Other','other@example.test'),($5,'Owner','owner@example.test')",[P,Q,C,X,O]);
 await db.exec('insert into auth.users select id,email,now() from public.profiles');
 await db.query("insert into public.relationships values($1,$2,true,'guardian')",[P,C]);
 await db.exec(await read('../supabase/migrations/20260928155144_step_11_family.sql'));
 await db.exec(await read('../supabase/migrations/20260928155154_step_11_family_attendance.sql'));
});
after(async()=>db?.close());
test('mehrere Kinder ohne Login; Wiederholung erzeugt kein Duplikat',async()=>{
 const a=await create(P,'Erstes Kind'),b=await create(P,'Zweites Kind');assert.notEqual(a,b);
 await create(P,'Erstes Kind',a);
 const rows=await rpc(P,'select id,user_id from public.training_athletes where id in ($1,$2)',[a,b]);
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.user_id===null));
 assert.equal((await rpc(X,'select id from public.training_athletes where id=$1',[a])).length,0);
 await assert.rejects(create(X,'Übernahme',a),/FAMILY_FORBIDDEN/);
});
test('vorhandene Elternbeziehung sichtbar; Entzug wirkt sofort',async()=>{
 assert.equal((await rpc(P,'select id from public.training_athletes where user_id=$1',[C])).length,1);
 await db.query('update public.relationships set active=false where guardian_user_id=$1',[P]);
 assert.equal((await rpc(P,'select id from public.training_athletes where user_id=$1',[C])).length,0);
 await db.query('update public.relationships set active=true where guardian_user_id=$1',[P]);
});
test('Anlage benötigt Erklärung, gültigen Namen und aktives Konto',async()=>{
 await assert.rejects(rpc(P,'select public.family_create_child($1,$2,false)',[randomUUID(),'Name']),/FAMILY_INVALID/);
 await assert.rejects(create(P,' '),/FAMILY_INVALID/);
 await db.query("insert into public.guardian_approval_requests values($1,current_date+100,'pending')",[X]);
 await assert.rejects(create(X),/FAMILY_FORBIDDEN/);
 await db.query('delete from public.guardian_approval_requests where minor_user_id=$1',[X]);
});
test('Einladung benötigt bestätigte Ziel-E-Mail und ist einmalig',async()=>{
 const child=await create(P);
 const [{token}]=await rpc(P,"select public.family_invite_guardian($1,'second@example.test') token",[child]);
 await assert.rejects(rpc(X,'select public.family_accept_invitation($1,true)',[token]),/FAMILY_LINK_INVALID/);
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[Q]);
 await assert.rejects(rpc(Q,'select public.family_accept_invitation($1,true)',[token]),/FAMILY_LINK_INVALID/);
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[Q]);
 await rpc(Q,'select public.family_accept_invitation($1,true)',[token]);
 assert.equal((await rpc(Q,'select id from public.training_athletes where id=$1',[child])).length,1);
 await assert.rejects(rpc(Q,'select public.family_accept_invitation($1,true)',[token]),/FAMILY_LINK_INVALID/);
});
test('Ablauf und entzogene Absenderberechtigung sperren Einladungsannahme',async()=>{
 const child=await create(P);
 const [{token}]=await rpc(P,"select public.family_invite_guardian($1,'second@example.test') token",[child]);
 await db.query('update public.family_guardians set revoked_at=now() where athlete_id=$1',[child]);
 await assert.rejects(rpc(Q,'select public.family_accept_invitation($1,true)',[token]),/FAMILY_LINK_INVALID/);
 await db.query('update public.family_guardians set revoked_at=null where athlete_id=$1',[child]);
 await db.query('update private.family_invitations set expires_at=now() where athlete_id=$1',[child]);
 await assert.rejects(rpc(Q,'select public.family_accept_invitation($1,true)',[token]),/FAMILY_LINK_INVALID/);
});
test('direkte Schreibzugriffe und anonyme Commands gesperrt',async()=>{
 const child=await create(P);
 await assert.rejects(rpc(P,'update public.training_athletes set display_name=$1 where id=$2',['Manipuliert',child]),/permission denied/);
 await assert.rejects(rpc(X,'insert into public.family_guardians(athlete_id,guardian_id) values($1,$2)',[child,X]),/permission denied/);
 await assert.rejects(rpc(P,'select * from private.family_invitations'),/permission denied/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select public.family_create_child($1,$2,true)',[randomUUID(),'Anonymous']);}),/permission denied/);
});
test('Elternkontolöschung erhält die Kinderidentität',async()=>{
 const temporary=randomUUID();await db.query("insert into public.profiles(id,display_name,email) values($1,'Temporary','temp@example.test')",[temporary]);
 const child=await create(temporary);await db.query('delete from public.profiles where id=$1',[temporary]);
 assert.equal((await db.query('select id from public.training_athletes where id=$1',[child])).rows.length,1);
});

const event=async()=>{
 const id=randomUUID();
 await db.query("insert into public.events(id,organization_id,created_by,type,starts_at,ends_at,location,title,response_deadline) values($1,$2,$3,'training',now()+interval '2 days',now()+interval '2 days 2 hours','Skatepark','Training',now()-interval '1 hour')",[id,'10000000-0000-0000-0000-000000000001',O]);
 await user(O,tx=>tx.query("insert into public.event_participants(event_id,user_id,invited_email,invited_by,status) values($1,$2,'child@example.test',$3,'open'),($1,$4,'other@example.test',$3,'open')",[id,C,O,X]));
 return id;
};
const overview=async id=>(await rpc(id,'select public.family_overview() result'))[0].result;
const child=async()=>(await db.query('select id from public.training_athletes where user_id=$1',[C])).rows[0].id;
const response=async(actor,eventId,status='confirmed',revision=0,at=null,ack=false)=>rpc(actor,'select public.family_respond_event($1,$2,$3,$4,$5,$6)',[await child(),eventId,status,revision,at,ack]);
test('Elternantwort aktualisiert ausschließlich das Kind; Eltern erhalten keine Gruppenliste',async()=>{
 const e=await event();
 const data=await overview(P), own=data.children.find(c=>c.hasLogin);
 assert.ok(own.events.some(r=>r.id===e));
 assert.equal(JSON.stringify(data).includes('other@example.test'),false);
 assert.equal((await overview(Q)).children.some(c=>c.hasLogin),false);
 await response(P,e);
 const rows=(await db.query('select user_id,status,response_is_late from public.event_participants where event_id=$1 order by user_id',[e])).rows;
 assert.deepEqual(rows.map(r=>r.status),['confirmed','open']);assert.equal(rows[0].response_is_late,true);
 assert.equal((await db.query('select count(*)::int n from public.event_participants where event_id=$1 and user_id=$2',[e,P])).rows[0].n,0);
 assert.equal((await db.query('select actor_id,athlete_id from private.family_response_audit where event_id=$1',[e])).rows[0].actor_id,P);
});
test('fremdes Konto, fehlende Einladung und veraltete Elternantwort werden abgelehnt',async()=>{
 const e=await event();await assert.rejects(response(Q,e),/FAMILY_FORBIDDEN/);
 await assert.rejects(response(P,randomUUID()),/FAMILY_FORBIDDEN/);
 await response(P,e);await assert.rejects(response(P,e,'declined'),/FAMILY_CONFLICT/);
 const [{responded_at}]= (await db.query('select responded_at from public.event_participants where event_id=$1 and user_id=$2',[e,C])).rows;
 await response(P,e,'declined',0,responded_at);
 assert.equal((await db.query('select status from public.event_participants where event_id=$1 and user_id=$2',[e,C])).rows[0].status,'declined');
});
test('wichtige Änderung erfordert aktuelle Revision; Kenntnisnahme ändert Teilnahme nicht',async()=>{
 const e=await event();
 await user(O,tx=>tx.query("update public.events set location='Anderer Park' where id=$1",[e]));
 await assert.rejects(response(P,e,'confirmed'),/FAMILY_CONFLICT/);
 const card=(await overview(P)).children.find(c=>c.hasLogin).events.find(r=>r.id===e);
 assert.equal(card.needsAcknowledgement,true);
 await response(P,e,null,1,null,true);
 const row=(await db.query('select status,acknowledged_revision from public.event_participants where event_id=$1 and user_id=$2',[e,C])).rows[0];
 assert.equal(row.status,'open');assert.equal(row.acknowledged_revision,1);
 assert.equal((await db.query('select acknowledged_by from public.event_revision_acknowledgements where participant_id=(select id from public.event_participants where event_id=$1 and user_id=$2)',[e,C])).rows[0].acknowledged_by,P);
});
test('entzogene Beziehung und abgesagter Termin erlauben keine Antwort',async()=>{
 const e=await event();
 await db.query('update public.relationships set active=false where guardian_user_id=$1',[P]);
 await assert.rejects(response(P,e),/FAMILY_FORBIDDEN/);
 await db.query('update public.relationships set active=true where guardian_user_id=$1',[P]);
 await user(O,tx=>tx.query("update public.events set status='cancelled',cancelled_at=now(),cancelled_feed_until=now()+interval '30 days' where id=$1",[e]));
 await assert.rejects(response(P,e,'confirmed',1),/FAMILY_INVALID/);
});
test('Einladungsvorschau zeigt nur dem vorgesehenen Elternkonto den Namen',async()=>{
 const a=await create(P,'Einladungskind');
 const [{token}]=await rpc(P,"select public.family_invite_guardian($1,'second@example.test') token",[a]);
 assert.equal((await rpc(X,'select public.family_invitation_preview($1) name',[token]))[0].name,null);
 assert.equal((await rpc(Q,'select public.family_invitation_preview($1) name',[token]))[0].name,'Einladungskind');
});

test('Eltern melden zwei Kinder ohne Login unabhängig an; Namen in kanonischer Teilnehmerliste',async()=>{
 const e=await event(),a=await create(O,'Ohne Login A'),b=await create(O,'Ohne Login B');
 for(const id of [a,b])await rpc(O,'select public.family_respond_event($1,$2,$3,0,null,false)',[id,e,'confirmed']);
 const rows=(await db.query('select family_athlete_id,family_display_name,user_id,invited_email from public.event_participants where event_id=$1 and family_athlete_id is not null order by family_display_name',[e])).rows;
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.family_display_name),['Ohne Login A','Ohne Login B']);
 assert.ok(rows.every(r=>r.user_id===null&&r.invited_email===null));
 const card=(await overview(O)).children.find(c=>c.id===b).events.find(r=>r.id===e);
 await rpc(O,'select public.family_respond_event($1,$2,$3,0,$4,false)',[b,e,'declined',card.responseAt]);
 assert.equal((await db.query('select status from public.event_participants where event_id=$1 and family_athlete_id=$2',[e,a])).rows[0].status,'confirmed');
});
test('fehlender Terminzugriff und direkte Kind-Zuordnung bleiben verboten',async()=>{
 const e=await event(),a=await create(P);
 await assert.rejects(rpc(P,'select public.family_respond_event($1,$2,$3,0,null,false)',[a,e,'confirmed']),/FAMILY_FORBIDDEN/);
 await assert.rejects(rpc(O,'insert into public.event_participants(event_id,family_athlete_id,invited_by) values($1,$2,$3)',[e,a,O]),/FAMILY_FORBIDDEN/);
});
test('Kind meldet sich selbst an: genau eine Elternnachricht, keine bei identischer Antwort',async()=>{
 const e=await event();
 const n=async()=>Number((await db.query("select count(*) n from public.notifications where user_id=$1 and link='/familie' and actor_user_id=$2",[P,C])).rows[0].n);
 const before=await n();
 await rpc(C,"update public.event_participants set status='confirmed',responded_at=now() where event_id=$1 and user_id=$2",[e,C]);
 assert.equal(await n(),before+1);
 await rpc(C,"update public.event_participants set status='confirmed',responded_at=now() where event_id=$1 and user_id=$2",[e,C]);
 assert.equal(await n(),before+1);
 await rpc(C,"update public.event_participants set status='declined',responded_at=now() where event_id=$1 and user_id=$2",[e,C]);
 assert.equal(await n(),before+2);
 const notices=(await overview(P)).notifications;assert.ok(notices.some(v=>v.title==='Kind hat abgesagt'));
});
test('Elternantwort und entzogene Beziehung erzeugen keine Selbstanmeldungsnachricht',async()=>{
 const e=await event();
 const n=async()=>Number((await db.query("select count(*) n from public.notifications where link='/familie'",[])).rows[0].n);
 const before=await n();await response(P,e);assert.equal(await n(),before);
 await db.query('update public.relationships set active=false where guardian_user_id=$1',[P]);
 await rpc(C,"update public.event_participants set status='declined',responded_at=now() where event_id=$1 and user_id=$2",[e,C]);
 assert.equal(await n(),before);
 await db.query('update public.relationships set active=true where guardian_user_id=$1',[P]);
});
test('auch die erste Selbstanmeldung ohne Einladung benachrichtigt die Eltern',async()=>{
 const e=await event();await db.query('delete from public.event_participants where event_id=$1 and user_id=$2',[e,C]);
 const before=(await db.query("select count(*)::int n from public.notifications where user_id=$1 and link='/familie'",[P])).rows[0].n;
 await rpc(C,"insert into public.event_participants(event_id,user_id,invited_email,invited_by,status,responded_at) values($1,$2,'child@example.test',$2,'confirmed',now())",[e,C]);
 assert.equal((await db.query("select count(*)::int n from public.notifications where user_id=$1 and link='/familie'",[P])).rows[0].n,before+1);
});
test('wichtige Terminänderung informiert Eltern der angemeldeten Kinder ohne Login',async()=>{
 const e=await event(),a=await create(O,'Terminänderungskind');
 await rpc(O,'select public.family_respond_event($1,$2,$3,0,null,false)',[a,e,'confirmed']);
 await user(O,tx=>tx.query("update public.events set location='Neuer Ort' where id=$1",[e]));
 assert.ok((await overview(O)).notifications.some(n=>n.message.includes('Terminänderungskind')));
 assert.equal((await overview(O)).children.find(c=>c.id===a).events.find(r=>r.id===e).needsAcknowledgement,true);
});
