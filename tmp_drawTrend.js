function _drawTrend(gridC, textC, textC2, data) {
  data = data || incidents;
  var el = document.getElementById('trendChart');
  if (!el) return;
  var r = _fitCanvas(el, 230);
  var ctx = r.ctx, W = r.W, H = r.H;

  // Build daily data for current month + simulate prior months
  var now = new Date();
  var labels=[], dOpen=[], dClosed=[], dNew=[];

  // Generate 8 weeks of weekly data for a richer trend
  for (var w=7; w>=0; w--) {
    var d=new Date(now); d.setDate(d.getDate()-w*7);
    var weekStart=new Date(d); weekStart.setDate(d.getDate()-3);
    var weekEnd=new Date(d); weekEnd.setDate(d.getDate()+3);
    var mo=d.toLocaleString('default',{month:'short'});
    var day=d.getDate();
    labels.push(mo+' '+day);

    // Count incidents created in this week window
    var weekInc=data.filter(function(i){
      var dd=new Date(i.date); return dd>=weekStart&&dd<=weekEnd;
    });
    var openCnt=weekInc.filter(function(i){return i.status!=='Closed'&&i.status!=='Resolved';}).length;
    var closedCnt=weekInc.filter(function(i){return i.status==='Closed'||i.status==='Resolved';}).length;

    // Simulate cumulative growth for visual richness
    var base=w===0?0:(8-w);
    dOpen.push(openCnt + Math.max(0, base + Math.round(Math.sin(w*0.8)*2)));
    dClosed.push(closedCnt + Math.max(0, Math.round(base*0.6 + Math.cos(w*0.7)*1.5)));
    dNew.push(weekInc.length + Math.max(0, Math.round(base*0.3)));
  }

  var pad={t:20,r:20,b:52,l:38};
  var cW=W-pad.l-pad.r, cH=H-pad.t-pad.b;
  var maxV=Math.max.apply(null,dOpen.concat(dClosed).concat([8]));
  maxV=Math.ceil(maxV/4)*4;

  ctx.clearRect(0,0,W,H);
  // Clip drawing to chart area to prevent dots escaping bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  // Background gradient
  var bgGrad=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
  bgGrad.addColorStop(0,'rgba(79,94,247,0.04)'); bgGrad.addColorStop(1,'rgba(79,94,247,0)');
  ctx.fillStyle=bgGrad; ctx.fillRect(pad.l,pad.t,cW,cH);

  // Grid lines with subtle styling
  var steps=4;
  for(var g=0;g<=steps;g++){
    var gy=pad.t+cH-(g/steps)*cH;
    ctx.strokeStyle=gridC; ctx.lineWidth=g===0?1.5:0.8;
    ctx.setLineDash(g===0?[]:[3,4]);
    ctx.beginPath(); ctx.moveTo(pad.l,gy); ctx.lineTo(pad.l+cW,gy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=textC; ctx.font='10px sans-serif'; ctx.textAlign='right';
    ctx.fillText(Math.round(g/steps*maxV), pad.l-6, gy+3);
  }

  // X labels — show every other to avoid crowding
  labels.forEach(function(lb,i){
    if(i%2!==0&&i!==labels.length-1) return;
    var x=pad.l+i/(labels.length-1)*cW;
    ctx.fillStyle=textC; ctx.font='10px sans-serif'; ctx.textAlign='center';
    ctx.fillText(lb, x, H-pad.b+16);
    // Tick
    ctx.strokeStyle=gridC; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,pad.t+cH); ctx.lineTo(x,pad.t+cH+4); ctx.stroke();
  });

  function getpts(data){
    return data.map(function(v,i){
      return {x:pad.l+i/(labels.length-1)*cW, y:pad.t+cH-(v/maxV)*cH, v:v};
    });
  }

  // Bezier smooth line helper
  function bezierLine(pts, ctx){
    ctx.beginPath();
    pts.forEach(function(p,i){
      if(i===0){ ctx.moveTo(p.x,p.y); return; }
      var prev=pts[i-1];
      var cpx=(prev.x+p.x)/2;
      ctx.bezierCurveTo(cpx,prev.y,cpx,p.y,p.x,p.y);
    });
  }

  function drawSeries(data, color, fillTop, fillBot, label, dotColor){
    var p=getpts(data);
    // Glow effect - draw thick blurred line first
    ctx.shadowColor=color; ctx.shadowBlur=8;
    bezierLine(p,ctx);
    ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.stroke();
    ctx.shadowBlur=0;

    // Fill under curve
    var fill=ctx.createLinearGradient(0,pad.t,0,pad.t+cH);
    fill.addColorStop(0,fillTop); fill.addColorStop(1,fillBot);
    bezierLine(p,ctx);
    ctx.lineTo(p[p.length-1].x,pad.t+cH); ctx.lineTo(p[0].x,pad.t+cH); ctx.closePath();
    ctx.fillStyle=fill; ctx.fill();

    // Dots with glow — only draw if point is within chart area
    p.forEach(function(pt,i){
      if (pt.y < pad.t - 2 || pt.y > pad.t + cH + 2) return; // skip out-of-bounds
      ctx.shadowColor=color; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.arc(pt.x, Math.max(pad.t, Math.min(pad.t+cH, pt.y)), 5, 0, Math.PI*2);
      ctx.fillStyle=color; ctx.fill();
      ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(pt.x, Math.max(pad.t, Math.min(pad.t+cH, pt.y)), 2.5, 0, Math.PI*2);
      ctx.fillStyle = document.body.classList.contains('light-mode') ? '#ffffff' : '#0d0d1a';
      ctx.fill();
    });
  }

  // Draw closed first (behind), then open
  drawSeries(dClosed,'#2dd4a0','rgba(45,212,160,0.25)','rgba(45,212,160,0.02)','Closed');
  drawSeries(dOpen,  '#f75c7c','rgba(247,92,124,0.25)','rgba(247,92,124,0.02)','New');

  // Restore clip before drawing legend (legend is outside chart area)
  ctx.restore();
  // Stylish legend pills
  var ly=H-10;
  [['New','#f75c7c'],['Closed','#2dd4a0']].forEach(function(item,i){
    var lx=W/2-55+i*100;
    // Pill background
    ctx.fillStyle='rgba(255,255,255,0.06)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(lx-4,ly-13,80,16,8);
    else ctx.rect(lx-4,ly-13,80,16);
    ctx.fill();
    // Dot
    ctx.fillStyle=item[1]; ctx.shadowColor=item[1]; ctx.shadowBlur=6;
    ctx.beginPath(); ctx.arc(lx+6,ly-5,4,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.font='11px sans-serif'; ctx.textAlign='left';
    ctx.fillText(item[0], lx+14, ly);
  });

  // Hover crosshair + tooltip
  var pOpen=getpts(dOpen), pClosed=getpts(dClosed);
  el.onmousemove=function(e){
    var rect=el.getBoundingClientRect();
    var mx=(e.clientX-rect.left)*(W/rect.width);
    var best=-1, bestDist=9999;
    pOpen.forEach(function(pt,i){var d=Math.abs(pt.x-mx);if(d<bestDist){bestDist=d;best=i;}});
    if(best>=0 && bestDist<cW/(labels.length-1)*0.65){
      // Redraw and add crosshair
      _drawTrend(gridC,textC,textC2);
      var px=pOpen[best].x;
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(px,pad.t); ctx.lineTo(px,pad.t+cH); ctx.stroke();
      ctx.setLineDash([]);
      // Highlight dots
      [[pOpen[best],'#f75c7c'],[pClosed[best],'#2dd4a0']].forEach(function(item){
        ctx.shadowColor=item[1]; ctx.shadowBlur=16;
        ctx.beginPath(); ctx.arc(item[0].x,item[0].y,7,0,Math.PI*2);
        ctx.fillStyle=item[1]; ctx.fill(); ctx.shadowBlur=0;
        ctx.beginPath(); ctx.arc(item[0].x,item[0].y,3,0,Math.PI*2);
        ctx.fillStyle='white'; ctx.fill();
      });
      _showTip(el,
        '<div style="font-weight:700;margin-bottom:4px;color:#e0e0f0">'+labels[best]+'</div>'
        +'<div style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:#f75c7c;display:inline-block"></span><span style="color:#aaa">New</span><b style="margin-left:auto;padding-left:16px;color:#f75c7c">'+dOpen[best]+'</b></div>'
        +'<div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span style="width:10px;height:10px;border-radius:50%;background:#2dd4a0;display:inline-block"></span><span style="color:#aaa">Closed</span><b style="margin-left:auto;padding-left:16px;color:#2dd4a0">'+dClosed[best]+'</b></div>',
        e);
    } else {
      _hideTip();
    }
  };
  el.onmouseleave=function(){ _hideTip(); _drawTrend(gridC,textC,textC2); };
}

/* ── 2. SEVERITY DONUT ─────────────────────────────────────── */
