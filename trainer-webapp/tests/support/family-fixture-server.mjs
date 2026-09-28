/** Lokaler Browserprüfstand mit echter Familienmigration; keine externen Konten. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
await db.exec(await read('../fixtures/carpool-base.sql'));
await db.exec(await read('../../supabase/migrations/20260903080920_carpool_release.sql'));
await db.exec(await read('../fixtures/calendar-communication-base.sql'));
await db.exec(await read('../../supabase/migrations/20260922122040_step_4_calendar_communication.sql'));
await db.exec(`create schema extensions;
 create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;
 create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex')$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table public.training_athletes(id uuid primary key default gen_random_uuid(),user_id uuid unique references public.profiles(id) on delete set null,display_name text not null,created_at timestamptz not null default now());
 alter table public.training_athletes enable row level security;
 grant select on public.training_athletes to authenticated;`);
const parent='00000000-0000-0000-0000-000000000004',child='00000000-0000-0000-0000-000000000002',owner='00000000-0000-0000-0000-000000000001';
await db.query("insert into public.profiles values($1,'Elternkonto','parent@example.test'),($2,'Alex','alex@example.test'),($3,'Trainer','trainer@example.test')",[parent,child,owner]);
await db.exec('insert into auth.users select id,email,now() from public.profiles');
await db.query("insert into public.relationships values($1,$2,true,'guardian')",[parent,child]);
await db.exec(await read('../../supabase/migrations/20260928155144_step_11_family.sql'));
await db.exec(await read('../../supabase/migrations/20260928155154_step_11_family_attendance.sql'));
// Eltern und Kind haben im Prüfstand eigene bestätigte Vereinsmitgliedschaften.
await db.exec("create or replace function private.is_organization_member(target uuid) returns boolean language sql stable as $$select target='10000000-0000-0000-0000-000000000001'::uuid and auth.uid() in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004')$$");
await db.query("insert into public.guardian_approval_requests values($1,current_date+730,'approved')",[child]);
const asUser=(id,fn)=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);return fn(tx);});
await asUser(parent,tx=>tx.query("select public.family_create_child(gen_random_uuid(),'Kim',true)"));
const event='20000000-0000-0000-0000-000000000001';
await db.query("insert into public.events(id,created_by,organization_id,title,type,starts_at,ends_at,location) values($1,$2,'10000000-0000-0000-0000-000000000001','Training am Mittwoch','training',(current_date+2)+time '14:00',(current_date+2)+time '16:00','Skatepark München')",[event,owner]);
await asUser(owner,tx=>tx.query("insert into public.event_participants(event_id,user_id,invited_email,invited_by) values($1,$2,'alex@example.test',$3)",[event,child,owner]));
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const users=[{id:parent,email:'parent@example.test',display_name:'Elternkonto',account_type:'guardian'},
 {id:child,email:'alex@example.test',display_name:'Alex',account_type:'athlete'}].map(u=>({...u,aud:'authenticated',user_metadata:{},app_metadata:{},created_at:new Date().toISOString(),token:
 enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:u.id,exp:4102444800,role:'authenticated',aud:'authenticated'})+'.local-fixture'}));
const rpcArgs={carpool_snapshot:["target_event","target_ride"],family_overview:[],family_self_notice:[],family_create_child:['child_id','child_name','declaration'],family_invite_guardian:['target','recipient_email'],family_accept_invitation:['token','declaration'],family_invitation_preview:['token'],family_respond_event:['target','event','response','expected_revision','expected_response_at','acknowledge']};
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
 try {
  if(url.pathname==='/login'){
   const u=url.searchParams.get('role')==='child'?users[1]:users[0],token=u.token;
   const cookie='base64-'+enc({access_token:token,refresh_token:'local-only',expires_at:4102444800,expires_in:999999999,token_type:'bearer',user:u});
   res.setHeader('Set-Cookie',`sb-127-auth-token=${cookie}; Path=/; SameSite=Lax`);res.writeHead(302,{Location:u.id===child?'http://localhost:3111/kalender?event='+event:'http://localhost:3111/familie'});res.end();return;
  }
  const u=users.find(item=>req.headers.authorization===`Bearer ${item.token}`);
  if(!u){res.statusCode=401;res.end('{}');return;}
  if(url.pathname==='/auth/v1/user'){res.end(JSON.stringify(u));return;}
  let body='';for await(const chunk of req)body+=chunk;
  const args=body?JSON.parse(body):{},name=url.pathname.split('/').at(-1);
  if(url.pathname.startsWith('/rest/v1/rpc/') && Object.hasOwn(rpcArgs,name)){
   const values=rpcArgs[name].map(key=>args[key]??null);
   const result=await asUser(u.id,tx=>tx.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) data`,values));
   res.end(JSON.stringify(result.rows[0].data));return;
  }
  if(url.pathname==='/rest/v1/rpc/get_current_profile_email'){res.end(JSON.stringify(u.email));return;}
  if(url.pathname==='/rest/v1/organization_memberships'){
   res.end(JSON.stringify([{organization_id:'10000000-0000-0000-0000-000000000001',role:u.id===child?'athlete':'guardian',organizations:{id:'10000000-0000-0000-0000-000000000001',name:'Skateboard München'}}]));return;
  }
  if(url.pathname==='/rest/v1/notifications'){
   const data=await db.query('select * from public.notifications where user_id=$1 order by created_at desc',[u.id]);
   res.setHeader('Content-Range',`0-${Math.max(data.rows.length-1,0)}/${data.rows.length}`);res.end(req.method==='HEAD'?undefined:JSON.stringify(data.rows));return;
  }
  if(url.pathname==='/rest/v1/events'){
   const id=url.searchParams.get('id')?.replace(/^eq\./,'');
   const result=await asUser(u.id,tx=>tx.query(`select e.* from public.events e where ($1::uuid is null or e.id=$1) order by e.starts_at`,[id||null]));
   for(const row of result.rows){
    const parts=await asUser(u.id,tx=>tx.query('select * from public.event_participants where event_id=$1',[row.id]));
    row.event_participants=parts.rows.map(p=>({...p,profiles:p.user_id?{display_name:p.user_id===child?'Alex':'Trainer',account_type:'athlete'}:null}));
    row.event_information_links=[];
   }
   res.end(JSON.stringify(id?result.rows[0]:result.rows));return;
  }
  if(url.pathname==='/rest/v1/event_participants' && req.method==='POST'){
   await asUser(u.id,tx=>tx.query(`insert into public.event_participants(event_id,user_id,invited_email,invited_by,status,responded_at)
    values($1,$2,$3,$4,$5,$6) on conflict(event_id,invited_email) do update set user_id=excluded.user_id,status=excluded.status,responded_at=excluded.responded_at`,[args.event_id,args.user_id,args.invited_email,args.invited_by,args.status,args.responded_at]));
   res.statusCode=201;res.end('null');return;
  }
  if(url.pathname==='/rest/v1/profiles'){res.end(JSON.stringify({...u,avatar_path:null}));return;}
  if(['/rest/v1/account_deletion_requests','/rest/v1/guardian_approval_requests'].includes(url.pathname)){res.end('null');return;}
  res.setHeader('Content-Range','*/0');res.end('[]');
 }catch(error){res.statusCode=400;res.end(JSON.stringify({code:error.code||'XX000',message:error.message}));}
}).listen(54341,'127.0.0.1',()=>console.log('Family fixture: http://localhost:54341/login'));
