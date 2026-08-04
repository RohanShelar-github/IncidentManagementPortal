const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'AOC 24×7';
pptx.subject = 'Incident Management Portal team demonstration';
pptx.title = 'AOC 24×7 Incident Management Portal';
pptx.company = 'AOC 24×7';
pptx.lang = 'en-IN';
pptx.theme = {
  headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US'
};
pptx.defineSlideMaster({
  title: 'DARK',
  background: { color: '0D111A' },
  objects: [
    { rect: { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: '38BDF8' }, line: { color: '38BDF8' } } },
    { text: { text: 'AOC 24×7  |  INCIDENT MANAGEMENT PORTAL', options: { x: 0.55, y: 7.12, w: 5.6, h: 0.18, fontFace: 'Aptos', fontSize: 8, color: '64748B', charSpacing: 1.2, margin: 0 } } },
    { text: { text: 'Internal team demonstration', options: { x: 9.8, y: 7.12, w: 2.95, h: 0.18, align: 'right', fontFace: 'Aptos', fontSize: 8, color: '64748B', margin: 0 } } }
  ],
  slideNumber: { x: 12.78, y: 7.10, color: '64748B', fontSize: 8 }
});

const C = { bg:'0D111A', panel:'151B27', panel2:'1B2433', line:'283548', text:'F8FAFC', muted:'94A3B8', blue:'38BDF8', blue2:'2563EB', green:'2DD4A0', amber:'F7B94F', red:'F75C7C', purple:'A78BFA' };
const O = pptx.ShapeType;

function slide(title, kicker) {
  const s = pptx.addSlide('DARK');
  if (kicker) s.addText(kicker.toUpperCase(), { x:0.6,y:0.42,w:3.5,h:0.22,fontSize:9,bold:true,color:C.blue,charSpacing:2,margin:0 });
  s.addText(title, { x:0.6,y:0.72,w:12.1,h:0.55,fontSize:26,bold:true,color:C.text,margin:0,breakLine:false,fit:'shrink' });
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

// 1 — Cover
{
  const s=pptx.addSlide('DARK');
  s.background={color:C.bg};
  s.addShape(O.rect,{x:0,y:0,w:13.333,h:7.5,fill:{color:C.bg},line:{color:C.bg}});
  s.addShape(O.ellipse,{x:8.7,y:-1.1,w:5.4,h:5.4,fill:{color:C.blue2,transparency:72},line:{color:C.blue2,transparency:100}});
  s.addShape(O.ellipse,{x:10.1,y:1.15,w:3.9,h:3.9,fill:{color:C.purple,transparency:84},line:{color:C.purple,transparency:100}});
  pill(s,'TEAM DEMONSTRATION',0.72,0.68,2.25,C.blue);
  text(s,'AOC 24×7',0.72,1.55,7.6,0.72,42,C.text,{bold:true});
  text(s,'Incident Management Portal',0.72,2.32,8.8,0.72,32,C.blue,{bold:true});
  text(s,'One operational view for incident ownership, SLA visibility, resolution and reporting.',0.75,3.25,7.6,1.0,20,C.muted,{valign:'top'});
  s.addShape(O.line,{x:0.75,y:4.62,w:5.4,h:0,line:{color:C.line,width:2}});
  text(s,'Live walkthrough  •  15–20 minutes',0.75,4.85,5.4,0.32,13,C.green,{bold:true});
  text(s,'Presented to the operations team',0.75,5.28,5.4,0.3,12,C.muted);
  text(s,new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}),0.75,5.64,5.4,0.3,12,C.muted);
  notes(s,['Welcome the team.','Position this as an operational workflow demonstration—not only a UI tour.','Target duration: 15–20 minutes plus questions.']);
}

// 2 — Why
{
  const s=slide('Why this portal matters','Business context');
  text(s,'The challenge',0.65,1.48,3.7,0.35,16,C.red,{bold:true});
  bullets(s,['Incident information spread across emails and spreadsheets','Unclear ownership and inconsistent status updates','Limited real-time visibility into SLA risk','Manual effort to prepare stakeholder reports'],0.65,1.92,5.7,3.7,17,C.text);
  panel(s,6.75,1.5,5.9,4.65,C.panel);
  text(s,'The AOC 24×7 response',7.15,1.83,4.9,0.4,19,C.blue,{bold:true});
  const rows=[['01','Central record','One database-backed source of truth'],['02','Live operations','Ownership, status and SLA visibility'],['03','Consistent outputs','Previewed PDF and Excel reports'],['04','Governed access','Role and account controls']];
  rows.forEach((r,i)=>{const yy=2.45+i*0.82; pill(s,r[0],7.12,yy,0.58,[C.blue,C.green,C.amber,C.purple][i]); text(s,r[1],7.88,yy-0.02,1.85,0.29,14,C.text,{bold:true}); text(s,r[2],9.78,yy-0.02,2.35,0.38,11,C.muted);});
  notes(s,['Describe the operational pain first.','Then explain that the portal connects the complete lifecycle in one place.']);
}

// 3 — lifecycle
{
  const s=slide('The incident lifecycle in one workflow','Operating model');
  const stages=[['1','Detect & record',C.red],['2','Assign & triage',C.amber],['3','Track & collaborate',C.blue],['4','Resolve & document',C.green],['5','Report & improve',C.purple]];
  stages.forEach((a,i)=>{const x=0.65+i*2.48; panel(s,x,2.05,2.05,2.55,C.panel); s.addShape(O.ellipse,{x:x+0.69,y:2.35,w:0.68,h:0.68,fill:{color:a[2],transparency:8},line:{color:a[2]}}); text(s,a[0],x+0.69,2.35,0.68,0.68,20,'FFFFFF',{bold:true,align:'center'}); text(s,a[1],x+0.22,3.35,1.61,0.64,16,C.text,{bold:true,align:'center'}); if(i<4)s.addShape(O.chevron,{x:x+2.08,y:2.95,w:0.38,h:0.7,fill:{color:C.line},line:{color:C.line}});});
  panel(s,2.15,5.15,9.0,0.72,C.panel2);
  text(s,'Every stage preserves context, accountability and an auditable history.',2.45,5.31,8.4,0.36,17,C.green,{bold:true,align:'center'});
  notes(s,['Use this slide to set up the live story.','The demo incident will move through the same lifecycle.']);
}

// 4 — demo map
{
  const s=slide('Today’s live walkthrough','Demo map');
  const items=[['01','Sign in & Home','Consistent landing experience'],['02','Dashboard','Operational health and SLA exposure'],['03','Incidents','Create, find, assign and update'],['04','Reporting','Preview PDF and Excel outputs'],['05','Customer 360','Customer-specific service view'],['06','Administration','Users, roles and master data']];
  items.forEach((r,i)=>{const col=i%2,row=Math.floor(i/2),x=0.7+col*6.15,y=1.55+row*1.52; panel(s,x,y,5.7,1.17,C.panel); pill(s,r[0],x+0.2,y+0.24,0.58,[C.blue,C.green,C.red,C.amber,C.purple,C.blue][i]); text(s,r[1],x+1.0,y+0.18,2.15,0.33,16,C.text,{bold:true}); text(s,r[2],x+1.0,y+0.56,4.3,0.31,12,C.muted);});
  notes(s,['Tell the audience where the demo is going.','Invite questions at the end so the workflow stays coherent.']);
}

// 5 startup
{
  const s=slide('Demo environment startup','Before presenting');
  panel(s,0.65,1.55,5.95,4.85,C.panel);
  text(s,'1  Start the backend',0.98,1.88,4.5,0.4,18,C.blue,{bold:true});
  panel(s,0.98,2.42,5.25,1.02,'0A0E16');
  text(s,'cd "C:\\Incident Management Portal\\backend"\nnpm start',1.2,2.56,4.8,0.68,14,C.green,{fontFace:'Consolas',valign:'top'});
  text(s,'2  Start the frontend',0.98,3.83,4.5,0.4,18,C.blue,{bold:true});
  panel(s,0.98,4.37,5.25,1.02,'0A0E16');
  text(s,'cd "C:\\Incident Management Portal"\nnpm start',1.2,4.51,4.8,0.68,14,C.green,{fontFace:'Consolas',valign:'top'});
  panel(s,6.95,1.55,5.7,4.85,C.panel);
  text(s,'Pre-flight checklist',7.3,1.88,4.8,0.4,18,C.text,{bold:true});
  bullets(s,['MySQL service is running','API health: localhost:4000/api/health','Portal: localhost:5500','Login lands on Home','Dashboard and incident data load','PDF and Excel previews open','Browser hard-refreshed with Ctrl+F5'],7.25,2.42,4.9,3.5,15,C.text);
  notes(s,['Start both terminals before screen sharing.','Keep them minimized but running.','Have one browser tab already authenticated as a fallback.']);
}

// 6 dashboard
{
  const s=slide('1. Establish the operational picture','Dashboard');
  panel(s,0.65,1.55,7.65,4.95,C.panel);
  text(s,'What to demonstrate',0.98,1.88,3.5,0.35,18,C.blue,{bold:true});
  const metrics=[['Open incidents','Current workload',C.red],['SLA breach rate','Service risk',C.amber],['MTTR trends','Recovery performance',C.green],['Live countdown','Next action priority',C.blue]];
  metrics.forEach((m,i)=>{const x=0.98+(i%2)*3.45,y=2.52+Math.floor(i/2)*1.48;panel(s,x,y,3.05,1.12,C.panel2);text(s,m[0],x+0.2,y+0.18,2.6,0.28,15,m[2],{bold:true});text(s,m[1],x+0.2,y+0.57,2.6,0.25,11,C.muted);});
  panel(s,8.65,1.55,4.0,4.95,C.panel);
  text(s,'Say this',9.0,1.9,2.8,0.35,18,C.green,{bold:true});
  text(s,'“The dashboard gives operations and management an immediate view of workload, risk, SLA exposure and incident trends.”',9.0,2.5,3.25,1.85,18,C.text,{italic:true,valign:'top'});
  pill(s,'LIVE ACTION',9.0,4.88,1.25,C.blue);
  text(s,'Apply one customer or severity filter, then clear it.',9.0,5.34,3.1,0.58,12,C.muted,{valign:'top'});
  notes(s,['Open Dashboard.','Explain the four metric areas.','Apply one useful filter only; avoid spending time exploring every chart.']);
}

// 7 incident
{
  const s=slide('2. Demonstrate the core incident workflow','Incident management');
  const left=[['A','Find','Search, filter and sort'],['B','Visualize','List and Kanban views'],['C','Create','Capture complete incident context'],['D','Act','Assign, comment and change status']];
  left.forEach((r,i)=>{const y=1.48+i*1.17;panel(s,0.68,y,5.75,0.92,C.panel);pill(s,r[0],0.9,y+0.3,0.52,[C.blue,C.purple,C.red,C.green][i]);text(s,r[1],1.67,y+0.17,1.25,0.29,15,C.text,{bold:true});text(s,r[2],2.95,y+0.17,3.05,0.42,12,C.muted);});
  panel(s,6.78,1.48,5.85,4.43,C.panel);
  text(s,'Suggested demo incident',7.12,1.8,4.5,0.37,18,C.blue,{bold:true});
  const fields=[['Customer','NGC'],['Title','Demo – Application unavailable'],['Severity','Critical'],['Status','New'],['Area','Application'],['Description','Demonstration incident created during the AOC 24×7 walkthrough']];
  fields.forEach((f,i)=>{const y=2.38+i*0.52;text(s,f[0],7.12,y,1.15,0.25,11,C.muted,{bold:true});text(s,f[1],8.35,y,3.78,0.3,12,i===2?C.red:C.text,{bold:i===2});});
  text(s,'Finish by changing the status to In Progress.',7.12,5.55,4.7,0.3,12,C.green,{bold:true});
  notes(s,['Show list and Kanban briefly.','Create the prepared demo incident.','Open it, show SLA and activity information, then move it to In Progress.']);
}

// 8 reporting
{
  const s=slide('3. Turn incident data into usable outputs','Reporting');
  const cards=[['PDF','Stakeholder-ready','Formatted incident summary and KPIs',C.red],['EXCEL','Operations-ready','Structured detail for analysis and filtering',C.green]];
  cards.forEach((c,i)=>{const x=0.72+i*6.15;panel(s,x,1.55,5.75,3.15,C.panel);pill(s,c[0],x+0.35,1.92,1.05,c[3]);text(s,c[1],x+0.35,2.51,4.4,0.4,20,C.text,{bold:true});text(s,c[2],x+0.35,3.12,4.7,0.62,14,C.muted,{valign:'top'});text(s,'Preview  →  Verify  →  Download',x+0.35,4.05,4.8,0.3,13,c[3],{bold:true});});
  panel(s,2.0,5.12,9.3,0.82,C.panel2);
  text(s,'Previewing before download reduces incomplete or incorrect reports being distributed.',2.35,5.33,8.6,0.34,16,C.blue,{bold:true,align:'center'});
  notes(s,['Use a completed incident with full report data.','Show PDF preview, then Excel preview.','Download only one file live; keep samples ready for the other output.']);
}

// 9 customer 360
{
  const s=slide('4. Review service performance by customer','Customer 360');
  panel(s,0.7,1.5,4.15,4.9,C.panel);
  text(s,'Choose a customer',1.05,1.88,3.2,0.4,18,C.blue,{bold:true});
  text(s,'NGC',1.05,2.48,2.9,0.65,34,C.text,{bold:true});
  text(s,'Then connect operational events to the customer’s service experience.',1.05,3.35,3.2,1.0,17,C.muted,{valign:'top'});
  pill(s,'SERVICE REVIEW READY',1.05,5.35,2.1,C.green);
  const kpis=[['Incident volume',C.blue],['Severity mix',C.red],['SLA performance',C.amber],['Downtime',C.purple],['MTTR',C.green],['Incident history',C.blue]];
  kpis.forEach((k,i)=>{const x=5.25+(i%2)*3.65,y=1.5+Math.floor(i/2)*1.55;panel(s,x,y,3.25,1.18,C.panel);text(s,k[0],x+0.25,y+0.32,2.75,0.36,16,k[1],{bold:true,align:'center'});});
  notes(s,['Select NGC.','Highlight the relationship between incident performance and customer outcomes.','Position this view for service reviews and stakeholder discussions.']);
}

// 10 governance
{
  const s=slide('5. Show governance without slowing the demo','Administration');
  const cols=[['User Management',['Database-backed users','Activate / deactivate accounts','Change roles','Protected deletion'],C.blue],['Role Management',['Admin','CSO / PMO / AOC','Engineer','Stakeholder / Viewer'],C.purple],['Data Management',['Supporting master data','Consistent dropdown values','Operational data quality','Central maintenance'],C.green]];
  cols.forEach((c,i)=>{const x=0.65+i*4.18;panel(s,x,1.55,3.78,4.75,C.panel);text(s,c[0],x+0.28,1.9,3.2,0.48,18,c[2],{bold:true,align:'center'});bullets(s,c[1],x+0.34,2.65,3.05,2.65,14,C.text);});
  text(s,'Demo safely: explain account controls, but do not modify a real user.',2.5,6.56,8.3,0.32,13,C.amber,{bold:true,align:'center'});
  notes(s,['Briefly show each administrative area.','Do not deactivate or delete a real account during the presentation.','Emphasize that account state and role changes persist in MySQL.']);
}

// 11 value
{
  const s=slide('What the team gains','Expected outcomes');
  const outcomes=[['Visibility','One live picture of operational health',C.blue],['Accountability','Clear ownership and auditable activity',C.green],['Consistency','Standard workflow and report formats',C.purple],['SLA focus','Prioritize incidents before breach',C.red],['Customer insight','Service performance by customer',C.amber],['Control','Role-based access and account governance',C.blue]];
  outcomes.forEach((o,i)=>{const x=0.72+(i%3)*4.12,y=1.55+Math.floor(i/3)*2.28;panel(s,x,y,3.72,1.82,C.panel);s.addShape(O.ellipse,{x:x+0.25,y:y+0.31,w:0.5,h:0.5,fill:{color:o[2]},line:{color:o[2]}});text(s,o[0],x+0.95,y+0.27,2.35,0.34,17,C.text,{bold:true});text(s,o[1],x+0.25,y+0.94,3.1,0.54,12,C.muted,{valign:'top'});});
  notes(s,['Summarize outcomes rather than repeating features.','Connect each result to daily operational work.']);
}

// 12 close
{
  const s=slide('Discussion and next steps','Team feedback');
  text(s,'Three questions for the team',0.72,1.55,5.6,0.45,21,C.blue,{bold:true});
  const qs=[['01','Does this workflow match how we operate today?'],['02','Which fields, alerts or reports are still missing?'],['03','What should each role be allowed to view or change?']];
  qs.forEach((q,i)=>{const y=2.25+i*1.15;panel(s,0.72,y,7.15,0.88,C.panel);pill(s,q[0],0.95,y+0.28,0.62,[C.blue,C.green,C.purple][i]);text(s,q[1],1.82,y+0.16,5.55,0.48,15,C.text,{bold:true});});
  panel(s,8.35,1.55,4.3,4.5,C.panel2);
  text(s,'Proposed next steps',8.72,1.92,3.55,0.4,19,C.green,{bold:true});
  bullets(s,['Capture team feedback','Confirm role permissions','Validate required reports','Agree rollout and support model','Plan user acceptance testing'],8.68,2.55,3.35,2.65,15,C.text);
  text(s,'Thank you',8.72,5.35,3.3,0.44,22,C.text,{bold:true,align:'center'});
  notes(s,['Open the floor for questions.','Record workflow gaps, reporting needs and permission decisions.','Close with the proposed next steps.']);
}

pptx.writeFile({ fileName: 'AOC_24x7_Incident_Management_Portal_Demo.pptx' });
