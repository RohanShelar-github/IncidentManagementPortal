// Generates an end-to-end overview deck of the whole Incident Management Portal
// (architecture, data model, RBAC, lifecycle, mailbox automation, AI, reporting, admin).
// This is distinct from create-demo-presentation.js, which is a live-demo script.
const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'AOC 24×7';
pptx.subject = 'Incident Management Portal — end-to-end overview';
pptx.title = 'AOC 24×7 Incident Management Portal — Overview';
pptx.company = 'AOC 24×7';
pptx.lang = 'en-IN';
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
pptx.defineSlideMaster({
  title: 'DARK',
  background: { color: '0D111A' },
  objects: [
    { rect: { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: '38BDF8' }, line: { color: '38BDF8' } } },
    { text: { text: 'AOC 24×7  |  INCIDENT MANAGEMENT PORTAL', options: { x: 0.55, y: 7.12, w: 5.6, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '64748B', charSpacing: 1.2, margin: 0 } } },
    { text: { text: 'End-to-end overview', options: { x: 9.8, y: 7.12, w: 2.95, h: 0.18, align: 'right', fontFace: 'Aptos', fontSize: 8, color: '64748B', margin: 0 } } }
  ],
  slideNumber: { x: 12.78, y: 7.10, color: '64748B', fontSize: 8 }
});

const C = { bg:'0D111A', panel:'151B27', panel2:'1B2433', line:'283548', text:'F8FAFC', muted:'94A3B8', blue:'38BDF8', blue2:'2563EB', green:'2DD4A0', amber:'F7B94F', red:'F75C7C', purple:'A78BFA' };
const O = pptx.ShapeType;

function slide(title, kicker) {
  const s = pptx.addSlide('DARK');
  if (kicker) s.addText(kicker.toUpperCase(), { x:0.6,y:0.42,w:7,h:0.22,fontSize:9,bold:true,color:C.blue,charSpacing:2,margin:0 });
  s.addText(title, { x:0.6,y:0.72,w:12.1,h:0.55,fontSize:25,bold:true,color:C.text,margin:0,breakLine:false,fit:'shrink' });
  return s;
}
function text(s, value, x,y,w,h, size=16, color=C.text, opts={}) {
  s.addText(value, { x,y,w,h,fontSize:size,color,fontFace:'Aptos',margin:0.04,breakLine:false,fit:'shrink',valign:'mid',...opts });
}
function panel(s,x,y,w,h,fill=C.panel, radius=0.12) {
  s.addShape(O.roundRect,{x,y,w,h,rectRadius:radius,fill:{color:fill},line:{color:C.line,width:1},radius});
}
function pill(s,label,x,y,w,color=C.blue){
  s.addShape(O.roundRect,{x,y,w,h:0.32,fill:{color,transparency:82},line:{color,transparency:45,width:1},radius:0.15});
  text(s,label,x+0.08,y+0.02,w-0.16,0.26,9,color,{bold:true,align:'center'});
}
function bullets(s, items, x,y,w,h, size=16, color=C.text) {
  const runs=[];
  items.forEach((item,i)=>runs.push({text:item,options:{bullet:{indent:size},breakLine:i<items.length-1,hanging:3}}));
  s.addText(runs,{x,y,w,h,fontSize:size,color,breakLine:false,margin:0.08,paraSpaceAfterPt:12,breakLineOnTextOverflow:false,fit:'shrink',valign:'top'});
}
function notes(s, lines){ if (typeof s.addNotes === 'function') s.addNotes(lines); }
function arrow(s,x,y,w=0.5){ s.addShape(O.chevron,{x,y,w,h:0.5,fill:{color:C.line},line:{color:C.line}}); }
function cardRow(s, items, y, h=1.12, cols=2) {
  const gap=0.2, totalW=11.6, w=(totalW-gap*(cols-1))/cols;
  items.forEach((it,i)=>{
    const col=i%cols, row=Math.floor(i/cols), x=0.65+col*(w+gap), yy=y+row*(h+0.18);
    panel(s,x,yy,w,h,C.panel2);
    text(s,it[0],x+0.22,yy+0.16,w-0.44,0.32,15,it[2]||C.blue,{bold:true});
    text(s,it[1],x+0.22,yy+0.55,w-0.44,h-0.65,12,C.muted,{valign:'top'});
  });
}

// 1 — Cover
{
  const s=pptx.addSlide('DARK');
  s.background={color:C.bg};
  s.addShape(O.rect,{x:0,y:0,w:13.333,h:7.5,fill:{color:C.bg},line:{color:C.bg}});
  s.addShape(O.ellipse,{x:8.7,y:-1.1,w:5.4,h:5.4,fill:{color:C.blue2,transparency:72},line:{color:C.blue2,transparency:100}});
  s.addShape(O.ellipse,{x:10.1,y:1.15,w:3.9,h:3.9,fill:{color:C.purple,transparency:84},line:{color:C.purple,transparency:100}});
  pill(s,'END-TO-END OVERVIEW',0.72,0.68,2.7,C.blue);
  text(s,'AOC 24×7',0.72,1.55,7.6,0.72,42,C.text,{bold:true});
  text(s,'Incident Management Portal',0.72,2.32,8.8,0.72,32,C.blue,{bold:true});
  text(s,'What it is, how it is built, and every part of how an incident flows from detection to resolution and reporting.',0.75,3.25,8.6,1.0,19,C.muted,{valign:'top'});
  s.addShape(O.line,{x:0.75,y:4.62,w:5.4,h:0,line:{color:C.line,width:2}});
  text(s,'Full system & feature walkthrough',0.75,4.85,5.4,0.32,13,C.green,{bold:true});
  text(s,'Prepared for internal team presentation',0.75,5.28,5.4,0.3,12,C.muted);
  text(s,new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}),0.75,5.64,5.4,0.3,12,C.muted);
  notes(s,['This deck explains the whole application end to end: purpose, architecture, data, workflow, every major feature, and admin/security.']);
}

// 2 — Purpose
{
  const s=slide('What problem this portal solves','Purpose');
  text(s,'Before',0.65,1.48,3.7,0.35,16,C.red,{bold:true});
  bullets(s,['Incident/alert data scattered across email and spreadsheets','No consistent SLA / MTTR / MTTD tracking','Manual, inconsistent reporting to stakeholders','No structured way to catch incidents from monitoring alerts'],0.65,1.92,5.7,3.6,16,C.text);
  panel(s,6.75,1.5,5.9,4.65,C.panel);
  text(s,'What the portal is',7.15,1.83,4.9,0.4,19,C.blue,{bold:true});
  text(s,'A single operational system used by the AOC 24×7 team to log, work, and report on incidents for customers running Magic\'s cloud and on-prem products — with SLA visibility, automated alert-to-incident capture, and governed access.',7.15,2.35,5.15,3.6,15.5,C.text,{valign:'top'});
  notes(s,['Frame this as: one system replacing scattered manual tracking.']);
}

// 3 — Audience / roles
{
  const s=slide('Who uses the portal','Roles & audience');
  const roles=[['Admin','Full system access, user & role management',C.purple],['CSO','Manages/resolves incidents, generates reports',C.blue],['PMO','Read-only incidents & reports oversight',C.amber],['AOC','Operational incident handling & reporting',C.red],['Engineer','Creates & manages assigned incidents',C.green],['Stakeholder','Read-only dashboard & incident viewer',C.muted]];
  roles.forEach((r,i)=>{const col=i%3,row=Math.floor(i/3),x=0.65+col*4.12,y=1.55+row*2.35;panel(s,x,y,3.75,2.05,C.panel);s.addShape(O.ellipse,{x:x+0.28,y:y+0.28,w:0.5,h:0.5,fill:{color:r[2]},line:{color:r[2]}});text(s,r[0],x+0.98,y+0.25,2.6,0.4,18,C.text,{bold:true});text(s,r[1],x+0.28,y+0.95,3.25,0.95,13,C.muted,{valign:'top'});});
  notes(s,['Six roles today, each mapped to specific permissions stored in the database — not hardcoded.']);
}

// 4 — High level architecture
{
  const s=slide('How the system is put together','Architecture');
  const tiers=[
    ['Browser','Single-page app: login, dashboard, incidents, mailbox, drafts, reports, Customer 360, admin — plain HTML/CSS/JS, no framework',C.blue],
    ['UI Server (port 5500)','Serves static files only; proxies every /api/* call through to the backend; blocks any request for backend source, .env, or DB files',C.amber],
    ['API Server (port 3000/4000)','Node.js + Express. Auth, incidents, mailbox, roles, notifications, AI, master data — all behind JWT + role checks',C.green],
    ['MySQL Database','incident_management_db — incidents, users, roles/permissions, customers, areas, notifications, drafts, activity logs',C.purple]
  ];
  tiers.forEach((t,i)=>{const y=1.5+i*1.28;panel(s,0.65,y,10.6,1.05,C.panel);pill(s,String(i+1),0.9,y+0.36,0.5,t[2]);text(s,t[0],1.62,y+0.14,3.1,0.35,16,C.text,{bold:true});text(s,t[1],1.62,y+0.52,9.4,0.48,12.5,C.muted,{valign:'top'});if(i<3)arrow(s,11.35,y+0.28,0.35);});
  notes(s,['Two Node processes: a thin static/proxy UI server, and the real Express API server.','The UI server has a hard allowlist so the frontend origin can never leak backend source or secrets.']);
}

// 5 — Tech stack
{
  const s=slide('Technology stack','Under the hood');
  const cols=[
    ['Frontend',['Vanilla HTML / CSS / JavaScript (no framework, no build step)','Chart.js for dashboard & report charts','Hand-rolled XLSX/PDF report generation'],C.blue],
    ['Backend',['Node.js + Express','JWT authentication (jsonwebtoken)','mysql2 connection pool, prepared statements','nodemailer + Microsoft Graph / EWS for mail'],C.green],
    ['Data & Integrations',['MySQL 8 (utf8mb4)','Microsoft 365 mailbox (Graph API)','AI provider: OpenAI / Groq / Ollama (pluggable)'],C.purple]
  ];
  cols.forEach((c,i)=>{const x=0.65+i*4.18;panel(s,x,1.55,3.78,4.75,C.panel);text(s,c[0],x+0.28,1.9,3.2,0.48,18,c[2],{bold:true,align:'center'});bullets(s,c[1],x+0.34,2.65,3.05,2.6,13.5,C.text);});
  notes(s,['Deliberately lightweight stack — no framework lock-in on the frontend.','AI provider is swappable via config: local Ollama, or hosted Groq/OpenAI.']);
}

// 6 — Data model
{
  const s=slide('Core data model','Database');
  const entities=[
    ['incidents','Title, customer, severity, status, SLA, downtime, MTTR/MTTD, RCA, resolution — the central record',C.red],
    ['users / roles / permissions','DB-driven RBAC: roles → permissions → role_permissions',C.blue],
    ['customers / area','Master data referenced by every incident for reporting & filtering',C.green],
    ['incident_drafts','Incidents auto-detected from email, held for review before becoming real incidents',C.amber],
    ['activity_logs / notifications','Full audit trail of changes + in-app alerts (mentions, mail, critical incidents)',C.purple],
  ];
  entities.forEach((e,i)=>{const y=1.5+i*0.98;panel(s,0.65,y,11.6,0.82,C.panel);pill(s,'DB',0.9,y+0.25,0.5,e[2]);text(s,e[0],1.62,y+0.13,3.2,0.3,15,C.text,{bold:true});text(s,e[1],4.9,y+0.13,7.15,0.56,12.5,C.muted,{valign:'top'});});
  notes(s,['All timestamps are normalized to UTC under the hood so customers in different timezones compare correctly.']);
}

// 7 — Data heritage / legacy migration
{
  const s=slide('Nothing was lost in the move','Data heritage & integrity');
  panel(s,0.65,1.55,5.6,4.85,C.panel);
  text(s,'Legacy data, preserved',0.98,1.88,4.5,0.4,18,C.blue,{bold:true});
  bullets(s,['Historical Salesforce incident cases imported, not re-typed','Original case numbers kept alongside new portal IDs (sf_case_no)','Legacy metadata (source system, raw record) archived per incident','Every incident timestamp repaired & normalized to canonical UTC','Timezone aliases (IST/EST/PST/ET…) mapped consistently'],0.98,2.42,5.0,3.7,14.5,C.text);
  panel(s,6.55,1.55,6.1,4.85,C.panel2);
  text(s,'Why this matters to the team',6.9,1.88,5.4,0.4,18,C.green,{bold:true});
  text(s,'30+ schema migrations were applied to get here — and every one was additive (new columns/tables) rather than destructive. Historical incidents, SLA numbers, and downtime figures you already trust remain accurate and comparable to new ones.',6.9,2.5,5.4,3.6,15.5,C.text,{valign:'top'});
  notes(s,['Good slide if the audience worries about "did we lose old incident history" during the platform build-out.']);
}

// 8 — RBAC
{
  const s=slide('Access is governed, not assumed','Roles & permissions');
  panel(s,0.65,1.55,5.6,4.85,C.panel);
  text(s,'How it works',0.98,1.88,4.5,0.4,18,C.blue,{bold:true});
  bullets(s,['Every permission is a row in the database, not hardcoded in code','A role is simply a set of permission keys','Backend checks the role on every protected request','Frontend mirrors the same check to hide UI a user can\'t use','Even individual dashboard KPI cards can be permissioned per role'],0.98,2.42,5.0,3.7,15,C.text);
  panel(s,6.55,1.55,6.1,4.85,C.panel2);
  text(s,'Examples of permission keys',6.9,1.88,5.4,0.4,18,C.text,{bold:true});
  const perms=['view_incidents','create_incidents','edit_incidents','close_incidents','delete_incidents','view_mailbox','send_mailbox','delete_drafts','manage_users','manage_roles','view_dashboard_sla_breach','view_dashboard_resolution_rate'];
  perms.forEach((p,i)=>{const col=i%2,row=Math.floor(i/2),x=6.9+col*3.0,y=2.5+row*0.6; pill(s,p,x,y,2.85,C.blue);});
  notes(s,['This is why adding a new gated feature is additive, not risky — just a new permission row plus a route check.']);
}

// 9 — Incident lifecycle
{
  const s=slide('The incident lifecycle in one workflow','Operating model');
  const stages=[['1','Detect & record',C.red],['2','Assign & triage',C.amber],['3','Track & collaborate',C.blue],['4','Resolve & document',C.green],['5','Report & improve',C.purple]];
  stages.forEach((a,i)=>{const x=0.65+i*2.48; panel(s,x,2.05,2.05,2.55,C.panel); s.addShape(O.ellipse,{x:x+0.69,y:2.35,w:0.68,h:0.68,fill:{color:a[2],transparency:8},line:{color:a[2]}}); text(s,a[0],x+0.69,2.35,0.68,0.68,20,'FFFFFF',{bold:true,align:'center'}); text(s,a[1],x+0.22,3.35,1.61,0.64,16,C.text,{bold:true,align:'center'}); if(i<4)s.addShape(O.chevron,{x:x+2.08,y:2.95,w:0.38,h:0.7,fill:{color:C.line},line:{color:C.line}});});
  panel(s,2.15,5.15,9.0,0.72,C.panel2);
  text(s,'Incidents arrive manually or automatically from monitored email — same workflow either way.',2.35,5.31,8.4,0.36,15.5,C.green,{bold:true,align:'center'});
  notes(s,['Whether an incident is typed in manually or auto-captured from a monitoring alert email, it moves through the same five stages.']);
}

// 10 — Dashboard & KPIs
{
  const s=slide('Real-time operational visibility','Dashboard & KPIs');
  panel(s,0.65,1.55,7.65,4.95,C.panel);
  text(s,'What it shows',0.98,1.88,3.5,0.35,18,C.blue,{bold:true});
  const metrics=[['Total / Open / Resolved','Live incident counts',C.blue],['SLA breach rate','% of incidents that missed SLA',C.amber],['MTTR / MTTD','Mean time to resolve / detect',C.green],['Downtime totals','App vs. Historian downtime split',C.red],['Resolution rate','% incidents fully resolved',C.purple],['Trend charts','Volume & resolution over time',C.blue]];
  metrics.forEach((m,i)=>{const x=0.98+(i%2)*3.45,y=2.52+Math.floor(i/2)*1.48;panel(s,x,y,3.05,1.12,C.panel2);text(s,m[0],x+0.2,y+0.18,2.6,0.28,14,m[2],{bold:true});text(s,m[1],x+0.2,y+0.57,2.6,0.25,11,C.muted);});
  panel(s,8.65,1.55,4.0,4.95,C.panel);
  text(s,'Why it matters',9.0,1.9,2.8,0.35,18,C.green,{bold:true});
  text(s,'Every KPI is clickable — drilling into a metric shows exactly which incidents contribute to it, filtered by the dashboard\'s current filters.',9.0,2.5,3.25,2.0,15,C.text,{italic:true,valign:'top'});
  notes(s,['This is the daily landing view for most roles.','KPI cards drill down to the exact contributing incident list, not just a number.']);
}

// 11 — Incident workspace (views, search, bulk actions, saved filters)
{
  const s=slide('Working incidents day to day','Incident workspace');
  const items=[
    ['List & Kanban views','Toggle between a sortable table and a drag-friendly Kanban board by status',C.blue],
    ['Global search (Ctrl+K)','Command palette jumps straight to any incident, page, or action by typing',C.purple],
    ['Bulk actions','Multi-select incidents to update status/assignee across several at once',C.green],
    ['Saved report filters','Frequently used filter combinations saved for one-click reuse',C.amber],
  ];
  cardRow(s, items.map(i=>[i[0],i[1],i[2]]), 1.6, 1.55, 2);
  panel(s,0.65,4.9,11.6,1.5,C.panel2);
  text(s,'Pagination, sorting, and multi-field filtering (customer, severity, status, area) keep the list usable at scale.',0.98,5.15,11.0,1.0,15,C.text,{valign:'top'});
  notes(s,['This is the day-to-day incident list experience beyond just "create and view".']);
}

// 12 — Incident detail (description editor, comments & mentions)
{
  const s=slide('Incident detail — context that sticks','Collaboration');
  panel(s,0.65,1.55,5.6,4.85,C.panel);
  text(s,'Rich incident record',0.98,1.88,4.5,0.4,18,C.blue,{bold:true});
  bullets(s,['Rich-text description editor with pasted, resized & cropped images','Full activity/audit log — every field change is tracked','RCA and Resolution captured with the same rich-text support'],0.98,2.42,5.0,3.6,15,C.text);
  panel(s,6.55,1.55,6.1,4.85,C.panel2);
  text(s,'Comments & @mentions',6.9,1.88,5.4,0.4,18,C.green,{bold:true});
  bullets(s,['Threaded comments on every incident','Type @ to mention a teammate, with autocomplete','Mentioned users get an in-app notification instantly','Keeps discussion attached to the incident, not scattered in chat/email'],6.9,2.42,5.4,3.6,15,C.text);
  notes(s,['This slide answers "how do we discuss an incident without leaving the portal?"']);
}

// 13 — Notifications
{
  const s=slide('Notifications — keeping everyone in the loop','Alerts');
  panel(s,0.65,1.55,11.6,2.1,C.panel);
  text(s,'An in-app notification center (bell icon) surfaces what needs attention',0.98,1.85,11.0,0.45,18,C.blue,{bold:true});
  text(s,'Notifications are generated automatically for: @mentions in comments, new Operations mailbox messages, and critical-incident creation — no manual step required.',0.98,2.4,11.0,1.1,15,C.muted,{valign:'top'});
  const cards=[['Mark read / mark all read','Standard triage of the notification list',C.blue],['Live polling','New notifications appear without a page refresh',C.green],['24-hour retention','Old notifications are purged automatically to stay relevant',C.purple]];
  cards.forEach((c,i)=>{const x=0.65+i*3.95;panel(s,x,3.85,3.6,2.55,C.panel2);text(s,c[0],x+0.28,4.15,3.05,0.5,15,c[2],{bold:true});text(s,c[1],x+0.28,4.72,3.05,1.5,13,C.text,{valign:'top'});});
  notes(s,['Notifications tie together mentions, mail, and critical incidents into one place.']);
}

// 14 — Personal & SLA tools
{
  const s=slide('Built for the people doing the work','Personal & SLA tools');
  const items=[
    ['My Incidents','A filtered view of exactly what is assigned to the current user',C.blue],
    ['SLA countdown','Live countdown timers on open incidents approaching their SLA target',C.red],
    ['Engineer leaderboard','Visibility into workload and resolution activity across the team',C.amber],
    ['Recurring incident detection','Flags repeat issues for the same customer/area so patterns aren\'t missed',C.purple],
  ];
  cardRow(s, items, 1.6, 1.55, 2);
  panel(s,0.65,4.9,11.6,1.5,C.panel2);
  text(s,'These tools turn the portal from a system of record into a daily working tool for engineers, not just a reporting layer for management.',0.98,5.15,11.0,1.0,15,C.text,{valign:'top'});
  notes(s,['Useful slide for the engineer audience specifically — shows it is not just a management dashboard.']);
}

// 15 — Operations mailbox
{
  const s=slide('Watching the operations mailbox','Email intake');
  panel(s,0.65,1.55,5.95,4.85,C.panel);
  text(s,'How it works',0.98,1.88,4.5,0.4,18,C.blue,{bold:true});
  bullets(s,['Connects to a real mailbox via Microsoft Graph','Classifies incoming mail automatically:','   • Monitoring alerts (Coralogix, Azure)','   • "No Historian read" alerts','   • Customer-raised Jira tickets','Supports reply, send, and attachment download','Background poller raises in-app notifications for new mail'],0.98,2.42,5.4,4.0,14,C.text);
  panel(s,6.95,1.55,5.7,4.85,C.panel2);
  text(s,'Why it matters',7.3,1.88,4.8,0.4,18,C.green,{bold:true});
  text(s,'Alerts that used to live only in an inbox are now visible to the whole team, categorized, and directly actionable — without anyone needing mailbox access.',7.3,2.5,4.9,3.6,16,C.text,{valign:'top'});
  notes(s,['This is the Operations Mail feature — the mailbox becomes a shared, categorized, actionable queue.']);
}

// 16 — Mailbox depth
{
  const s=slide('Mailbox, in more depth','Operations mail — day to day');
  const items=[
    ['Per-user signatures','Each user manages their own reply signature; admins can manage all',C.blue],
    ['Read / Unread filter','Outlook-style filtering: All, Unread, Read',C.green],
    ['"Incident Sent" filter','Instantly see which emails already resulted in a created incident',C.purple],
    ['Recipient autosuggest','Typing in To/CC suggests known addresses, with drag-and-drop to add them',C.amber],
  ];
  cardRow(s, items, 1.6, 1.55, 2);
  panel(s,0.65,4.9,11.6,1.5,C.panel2);
  text(s,'These details are what make the mailbox usable as a shared team tool instead of a single person\'s inbox.',0.98,5.15,11.0,1.0,15,C.text,{valign:'top'});
  notes(s,['These are the refinements the team is actively using/building right now.']);
}

// 17 — Email to incident automation
{
  const s=slide('From alert email to tracked incident','Automated capture');
  const stages=[['1','Email arrives',C.blue],['2','Auto-classified',C.amber],['3','Incident drafted',C.purple],['4','Review window',C.red],['5','Confirmed as incident',C.green]];
  stages.forEach((a,i)=>{const x=0.65+i*2.48; panel(s,x,1.85,2.05,2.35,C.panel); text(s,a[0],x+0.15,2.05,1.75,0.5,22,a[2],{bold:true,align:'center'}); text(s,a[1],x+0.15,2.85,1.75,1.15,14,C.text,{bold:true,align:'center',valign:'top'}); if(i<4)s.addShape(O.chevron,{x:x+2.08,y:2.75,w:0.38,h:0.7,fill:{color:C.line},line:{color:C.line}});});
  panel(s,2.15,4.5,9.0,1.6,C.panel2);
  text(s,'A human always confirms',2.5,4.72,8.3,0.4,17,C.blue,{bold:true,align:'center'});
  text(s,'A drafted incident sits in the "Draft Review" queue with a review deadline. It is only ever finalized into a real, reportable incident after being reviewed — nothing is auto-created blind.',2.5,5.15,8.3,0.85,13.5,C.muted,{align:'center',valign:'top'});
  notes(s,['This is the incident_drafts workflow — the safety net that keeps automation trustworthy.']);
}

// 18 — AI copilot
{
  const s=slide('Ask the portal directly','AI incident copilot');
  panel(s,0.65,1.55,11.6,2.0,C.panel);
  text(s,'A built-in chat assistant answers operational questions directly from live data',0.98,1.85,11.0,0.45,18,C.blue,{bold:true});
  text(s,'e.g. "Show open Critical incidents" · "Summarize recent incidents" · "How many unread Operations emails?"',0.98,2.4,11.0,0.9,15,C.muted,{valign:'top'});
  const cards=[['Read-only by design','Queries incidents & mailbox data; cannot create or change anything',C.green],['Pluggable provider','Works with OpenAI, Groq, or a locally hosted Ollama model',C.blue],['Grounded answers','Builds compact, real incident context before answering — not free-form guessing',C.purple]];
  cards.forEach((c,i)=>{const x=0.65+i*3.95;panel(s,x,3.85,3.6,2.55,C.panel2);text(s,c[0],x+0.28,4.15,3.05,0.5,16,c[2],{bold:true});text(s,c[1],x+0.28,4.72,3.05,1.5,13,C.text,{valign:'top'});});
  notes(s,['The copilot only reads — it never mutates data. Good talking point for trust/security questions.']);
}

// 19 — Reporting
{
  const s=slide('Turning data into decisions','Reporting outputs');
  const cards=[['PDF Reports',['Formatted incident summary','Stakeholder-ready output','Preview before download'],C.red],['Excel Export',['Structured, filterable detail','Hand-built XLSX generation','Bulk / date-range export'],C.green],['Saved filters',['Reuse a frequent filter combo','One click to rebuild a report view','Consistent output every time'],C.amber]];
  cards.forEach((c,i)=>{const x=0.65+i*4.18;panel(s,x,1.55,3.78,4.75,C.panel);text(s,c[0],x+0.28,1.9,3.2,0.48,18,c[2],{bold:true,align:'center'});bullets(s,c[1],x+0.34,2.65,3.05,2.6,14,C.text);});
  notes(s,['Reports always preview before download so nothing incomplete gets distributed.']);
}

// 20 — Customer 360 & customer integrations
{
  const s=slide('Customer view & integrations','Customer 360');
  panel(s,0.7,1.5,4.15,4.9,C.panel);
  text(s,'Customer 360',1.05,1.85,3.2,0.4,18,C.blue,{bold:true});
  bullets(s,['Per-customer incident history','SLA & downtime performance','Severity mix and MTTR by customer','Built for service-review conversations'],1.05,2.4,3.2,2.6,14,C.text);
  panel(s,5.15,1.5,7.15,2.35,C.panel2);
  text(s,'Jira project code linking',5.5,1.83,6.4,0.4,17,C.purple,{bold:true});
  text(s,'Each customer can be mapped to a Jira project code, so customer-raised tickets from email are matched and routed correctly.',5.5,2.35,6.4,1.35,14,C.text,{valign:'top'});
  panel(s,5.15,4.05,7.15,2.35,C.panel2);
  text(s,'Critical-incident email automation',5.5,4.38,6.4,0.4,17,C.red,{bold:true});
  text(s,'When a Critical incident is created, an alert email is sent automatically to that customer\'s configured recipient list — no manual reminder needed.',5.5,4.9,6.4,1.35,14,C.text,{valign:'top'});
  notes(s,['This is where customer-specific configuration lives: Jira mapping and who gets critical alerts.']);
}

// 21 — Administration
{
  const s=slide('Keeping the system healthy','Administration');
  const cols=[['User Management',['DB-backed users','Activate / deactivate accounts','Change roles','Protected deletion','Last-active tracking'],C.blue],['Role Management',['Admin, CSO, PMO, AOC, Engineer, Stakeholder','Per-permission toggles','Per-dashboard-card visibility','Changes apply without a deploy'],C.purple],['Data Management',['Customers & areas master data','Keeps dropdowns consistent','Central place to fix data quality'],C.green]];
  cols.forEach((c,i)=>{const x=0.65+i*4.18;panel(s,x,1.55,3.78,4.75,C.panel);text(s,c[0],x+0.28,1.9,3.2,0.48,18,c[2],{bold:true,align:'center'});bullets(s,c[1],x+0.34,2.65,3.05,2.65,13.5,C.text);});
  notes(s,['Administration is itself permission-gated — only Admin (and select roles) can reach these screens.']);
}

// 22 — Account & session security
{
  const s=slide('Every account is protected','Account & session safeguards');
  const items=[
    ['Self-service profile','Users edit their own name, phone, department, bio, and password',C.blue],
    ['Admin password reset','Admins can reset a user\'s password without exposing the old one',C.purple],
    ['Session inactivity timeout','Idle sessions are automatically signed out',C.amber],
    ['Login attempt limiting','Repeated failed logins are throttled to resist brute-force attempts',C.red],
  ];
  cardRow(s, items, 1.6, 1.55, 2);
  panel(s,0.65,4.9,11.6,1.5,C.panel2);
  text(s,'A deactivated account is blocked instantly — every request re-checks the user\'s status against the database, not just the login token.',0.98,5.15,11.0,1.0,15,C.text,{valign:'top'});
  notes(s,['This slide answers "what happens when someone leaves the team or forgets their password?"']);
}

// 23 — Platform security
{
  const s=slide('Built with security in mind','Platform security & reliability');
  const items=[
    ['Authentication','JWT-based, verified against a live DB user lookup on every request',C.blue],
    ['Authorization','Role-based, permission checked server-side on every protected route — not just hidden UI',C.green],
    ['Network hardening','Strict CORS allowlist, security headers, CSP, no backend/source exposure via the UI server',C.amber],
    ['Data safety','Prepared statements throughout, and additive-only schema migrations — no destructive changes',C.purple],
  ];
  items.forEach((it,i)=>{const y=1.55+i*1.15;panel(s,0.65,y,11.6,0.98,C.panel);pill(s,'SEC',0.9,y+0.33,0.55,it[2]);text(s,it[0],1.65,y+0.15,3.0,0.32,15,C.text,{bold:true});text(s,it[1],4.75,y+0.15,7.3,0.68,13,C.muted,{valign:'top'});});
  notes(s,['This slide is useful if leadership/security stakeholders are in the room.']);
}

// 24 — Value / outcomes
{
  const s=slide('What the team gains','Expected outcomes');
  const outcomes=[['Visibility','One live picture of operational health',C.blue],['Accountability','Clear ownership and auditable activity',C.green],['Automation','Alerts become tracked incidents with a human checkpoint',C.purple],['SLA focus','Prioritize incidents before breach',C.red],['Customer insight','Service performance by customer',C.amber],['Control','Role-based access and account governance',C.blue]];
  outcomes.forEach((o,i)=>{const x=0.72+(i%3)*4.12,y=1.55+Math.floor(i/3)*2.28;panel(s,x,y,3.72,1.82,C.panel);s.addShape(O.ellipse,{x:x+0.25,y:y+0.31,w:0.5,h:0.5,fill:{color:o[2]},line:{color:o[2]}});text(s,o[0],x+0.95,y+0.27,2.35,0.34,17,C.text,{bold:true});text(s,o[1],x+0.25,y+0.94,3.1,0.54,12,C.muted,{valign:'top'});});
  notes(s,['Summarize outcomes, not features, to close the technical walkthrough.']);
}

// 25 — Close
{
  const s=slide('Discussion and next steps','Team feedback');
  text(s,'Questions for the team',0.72,1.55,5.6,0.45,21,C.blue,{bold:true});
  const qs=[['01','Does this end-to-end flow match how we operate today?'],['02','Which reports, alerts, or fields are still missing?'],['03','What should each role be allowed to view or change?']];
  qs.forEach((q,i)=>{const y=2.25+i*1.15;panel(s,0.72,y,7.15,0.88,C.panel);pill(s,q[0],0.95,y+0.28,0.62,[C.blue,C.green,C.purple][i]);text(s,q[1],1.82,y+0.16,5.55,0.48,15,C.text,{bold:true});});
  panel(s,8.35,1.55,4.3,4.5,C.panel2);
  text(s,'Roadmap in progress',8.72,1.92,3.55,0.4,19,C.green,{bold:true});
  bullets(s,['Per-dashboard-card role permissions','User last-active tracking','Operations mail: incident-linked email filter','Recipient directory autosuggest in mail compose'],8.68,2.55,3.35,2.65,14,C.text);
  text(s,'Thank you',8.72,5.35,3.3,0.44,22,C.text,{bold:true,align:'center'});
  notes(s,['Close with what is actively being worked on right now, to invite feedback on direction.']);
}

pptx.writeFile({ fileName: 'AOC_24x7_Incident_Management_Portal_Overview.pptx' });
