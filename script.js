    const progress = document.getElementById('progress');
    const glow = document.getElementById('glow');
    const cursorRing = document.getElementById('cursor-ring');
    const cursorDot = document.getElementById('cursor-dot');
    const backTop = document.getElementById('back-top');
    const nav = document.querySelector('.nav');
    const navLinks = Array.from(nav.querySelectorAll('a'));
    const navToggle = document.querySelector('.nav-toggle');
    const finePointer = window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)');

    const track = document.getElementById('project-track');
    const cards = Array.from(track.querySelectorAll('.project-card'));
    const projectIndex = document.getElementById('project-index');
    const projectStage = document.getElementById('project-stage');
    const projectFilters = Array.from(document.querySelectorAll('[data-project-filter]'));
    const projectMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tabButtons = [];
    let activeProjectCard = null;
    let activeGraphicCard = null;
    let graphicFrame = 0;
    let graphicGeometry = null;
    let engineCanvasState = null;
    let cashflowCanvasState = null;
    const svgNamespace = 'http://www.w3.org/2000/svg';

    cards.forEach((card, index) => {
      const title = card.querySelector('h3')?.textContent.trim() || `Project ${index + 1}`;
      const number = card.querySelector('.project-number')?.textContent.split('//')[0].trim() || String(index + 1).padStart(2, '0');
      const type = card.querySelector('.project-status')?.textContent.trim() || 'Project';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-entry';
      button.id = `project-tab-${index + 1}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'project-stage');
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      button.dataset.projectIndex = String(index);
      const count = document.createElement('span');
      count.className = 'project-entry-number';
      count.textContent = number;
      const copy = document.createElement('span');
      copy.className = 'project-entry-copy';
      const name = document.createElement('span');
      name.className = 'project-entry-title';
      name.textContent = title;
      const category = document.createElement('span');
      category.className = 'project-entry-type';
      category.textContent = type;
      copy.append(name, category);
      button.append(count, copy);
      button.addEventListener('click', () => selectProject(index));
      button.addEventListener('keydown', (event) => {
        const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
        if (direction) {
          event.preventDefault();
          const visibleTabs = tabButtons.filter((tab) => !tab.hidden);
          const current = visibleTabs.indexOf(button);
          const next = visibleTabs[(current + direction + visibleTabs.length) % visibleTabs.length];
          next?.focus();
          next?.click();
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          const visibleTabs = tabButtons.filter((tab) => !tab.hidden);
          const next = event.key === 'Home' ? visibleTabs[0] : visibleTabs[visibleTabs.length - 1];
          next?.focus();
          next?.click();
        }
      });
      projectIndex.append(button);
      tabButtons.push(button);
      card.removeAttribute('data-reveal');
      card.classList.add('visible');
    });
    track.hidden = true;

    const engineFaults = [
      { name: 'NOMINAL', lambda: '1.00', afr: '14.7', accent: '#64d3b0' },
      { name: 'RICH MIXTURE', lambda: '0.82', afr: '12.1', accent: '#ff9b50' },
      { name: 'LEAN MIXTURE', lambda: '1.24', afr: '18.2', accent: '#ff5b60' },
      { name: 'LOW VOLTAGE', lambda: 'VARIES', afr: 'VARIES', accent: '#f0d34a' }
    ];
    const firingOrder = [0, 2, 3, 1];
    // A conventional inline-four crank pairs 1+4 and 2+3; ignition still fires 1-3-4-2.
    const cylinderPhases = [Math.PI, 0, 0, Math.PI];
    const mixHex = (from, to, amount) => {
      const a = from.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16));
      const b = to.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16));
      return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
    };
    const cashflowCategories = [
      { label: 'HOUSING & UTILITIES', color: '#b58be8', amount: 14200, share: 33, interval: 1250, travel: 4400, radius: 2.1, curve: [220, 158, 333, 18] },
      { label: 'FOOD & DINING', color: '#55d8d0', amount: 11800, share: 27, interval: 560, travel: 2900, radius: 1.8, curve: [232, 161, 350, 121] },
      { label: 'TECH & INFRA', color: '#f2a43c', amount: 9800, share: 23, interval: 820, travel: 3500, radius: 2, curve: [218, 157, 322, 238] },
      { label: 'LEISURE', color: '#ff5268', amount: 7000, share: 17, interval: 1050, travel: 4100, radius: 2, curve: [206, 162, 340, 308] }
    ];
    const cashflowPoint = (categoryIndex, t) => {
      const endY = [62, 128, 207, 275][categoryIndex];
      const startX = 37, startY = 160, endX = 496;
      const [control1X, control1Y, control2X, control2Y] = cashflowCategories[categoryIndex].curve;
      const inverse = 1 - t;
      return {
        x: inverse ** 3 * startX + 3 * inverse ** 2 * t * control1X + 3 * inverse * t ** 2 * control2X + t ** 3 * endX,
        y: inverse ** 3 * startY + 3 * inverse ** 2 * t * control1Y + 3 * inverse * t ** 2 * control2Y + t ** 3 * endY
      };
    };
    const drawCashflowCanvas = (state, time = performance.now()) => {
      const { canvas, context } = state, rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3), width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.setTransform(dpr * rect.width / 640, 0, 0, dpr * rect.height / 320, 0, 0);
      context.clearRect(0, 0, 640, 320);
      const reduced = projectMotionPreference.matches;
      const spikeProgress = state.spikeAt ? Math.max(0, 1 - (time - state.spikeAt) / 1500) : 0;
      const spike = spikeProgress * spikeProgress;
      const motionTime = reduced ? 0 : state.motionTime;
      context.strokeStyle = 'rgba(150,174,201,.055)'; context.lineWidth = .7;
      for (let x = 20; x < 640; x += 32) { context.beginPath(); context.moveTo(x, 32); context.lineTo(x, 310); context.stroke(); }
      for (let y = 40; y < 311; y += 32) { context.beginPath(); context.moveTo(18, y); context.lineTo(632, y); context.stroke(); }
      const rootY = 160;
      context.textAlign = 'left'; context.textBaseline = 'alphabetic'; context.fillStyle = '#c4c3d3'; context.font = '8px ui-monospace,monospace'; context.fillText('INFLOW // TRUNK', 25, rootY - 18);
      context.fillStyle = '#7e8394'; context.font = '7px ui-monospace,monospace'; context.fillText('₹42,800 / MO', 25, rootY + 21);
      context.fillStyle = '#ded8ec'; context.beginPath(); context.arc(37, rootY, 4, 0, Math.PI * 2); context.fill();
      if (!reduced) {
        cashflowCategories.forEach((category, index) => {
          const packets = state.particles[index];
          const hovered = state.hoverCategory === index;
          while (motionTime >= state.nextSpawnAt[index]) {
            const bornAt = state.nextSpawnAt[index];
            packets.push({ bornAt, travel: category.travel * (.72 + Math.random() * .62), radius: category.radius * (.78 + Math.random() * .72), speed: .78 + Math.random() * .62 });
            state.nextSpawnAt[index] = bornAt + category.interval * (hovered ? .48 + Math.random() * .48 : .62 + Math.random() * 1.08);
          }
          for (let packet = packets.length - 1; packet >= 0; packet--) {
            const particle = packets[packet], age = motionTime - particle.bornAt;
            const progress = age / (particle.travel / (particle.speed * (hovered ? 1.25 : 1) * (state.spikeCategory === index && spike > 0 ? 1 + spike * .3 * Math.sin(time / 47 + particle.bornAt) : 1)));
            if (progress >= 1) packets.splice(packet, 1);
          }
        });
      }
      cashflowCategories.forEach((category, index) => {
        const start = cashflowPoint(index, 0), end = cashflowPoint(index, 1);
        const hovered = state.hoverCategory === index;
        const activeFault = state.spikeCategory === index ? spike * (.74 + .26 * Math.abs(Math.sin(motionTime / 95))) : 0;
        const stroke = activeFault > .01 ? mixHex(category.color, '#ff5b4b', activeFault) : category.color;
        const [c1x, c1y, c2x, c2y] = category.curve;
        const drawPipe = () => { context.beginPath(); context.moveTo(start.x, start.y); context.bezierCurveTo(c1x, c1y, c2x, c2y, end.x, end.y); };
        context.save(); context.lineCap = 'round';
        drawPipe(); context.strokeStyle = stroke; context.globalAlpha = hovered ? .94 : .62 + activeFault * .25; context.lineWidth = hovered ? 2.35 : activeFault > .05 ? 2.15 : 1.45; context.stroke();
        context.restore(); context.globalAlpha = 1;
        for (const particle of state.particles[index]) {
          const age = Math.max(0, motionTime - particle.bornAt);
          const travelFactor = particle.speed * (hovered ? 1.25 : 1) * (state.spikeCategory === index && spike > 0 ? 1 + spike * .3 * Math.sin(time / 47 + particle.bornAt) : 1);
          const progress = age / (particle.travel / travelFactor);
          if (progress > 1) continue;
          const point = cashflowPoint(index, Math.max(0, progress));
          const radius = particle.radius * (hovered ? 1.18 : 1);
          context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fillStyle = stroke; context.fill();
          context.beginPath(); context.arc(point.x, point.y, Math.max(.5, radius * .34), 0, Math.PI * 2); context.fillStyle = '#f4f0fa'; context.fill();
        }
        const nodeX = 510;
        context.fillStyle = stroke; context.beginPath(); context.arc(nodeX - 7, end.y, hovered ? 2.9 : 2.2, 0, Math.PI * 2); context.fill();
        context.textAlign = 'left'; context.fillStyle = hovered ? '#f5f1fc' : '#b5b3c4'; context.font = 'bold 6.8px ui-monospace,monospace'; context.fillText(category.label, nodeX, end.y - 4);
        if (state.spikeCategory === index && spike > 0) {
          context.fillStyle = `rgba(255,105,74,${.66 + .34 * spike})`; context.font = 'bold 6.5px ui-monospace,monospace'; context.fillText('SPIKE DETECTED', nodeX, end.y + 11);
        } else {
          context.fillStyle = '#818395'; context.font = '7px ui-monospace,monospace'; context.fillText(`₹${category.amount.toLocaleString('en-IN')} / MO`, nodeX, end.y + 11);
        }
      });
      context.fillStyle = '#e5deef'; context.beginPath(); context.arc(37, rootY, 3.2, 0, Math.PI * 2); context.fill();
      if (state.hoverCategory !== null) {
        const category = cashflowCategories[state.hoverCategory];
        const pillWidth = 188, pillX = Math.max(10, Math.min(640 - pillWidth - 10, state.pointerX - pillWidth / 2));
        const pillY = Math.max(38, Math.min(286, state.pointerY - 38));
        context.fillStyle = 'rgba(4,15,21,.96)'; context.fillRect(pillX, pillY, pillWidth, 25);
        context.strokeStyle = 'rgba(175,173,194,.68)'; context.lineWidth = 1; context.strokeRect(pillX, pillY, pillWidth, 25);
        context.textAlign = 'center'; context.fillStyle = '#eafff8'; context.font = '7px ui-monospace,monospace';
        context.fillText(`₹${category.amount.toLocaleString('en-IN')} / MO · ${category.share}% OF INFLOW`, pillX + pillWidth / 2, pillY + 16);
      }
    };
    const drawI4Canvas = (state) => {
      const { canvas, context } = state, rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3), width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.setTransform(dpr * rect.width / 520, 0, 0, dpr * rect.height / 250, 0, 0); context.clearRect(0, 0, 520, 250);
      const fault = engineFaults[state.faultClass], xs = [95, 205, 315, 425], crankY = 188, radius = 26, rodLength = 90, now = performance.now();
      const transition = Math.min(1, Math.max(0, (now - state.faultChangedAt) / 1700));
      const glowColor = mixHex(engineFaults[state.faultFromClass].accent, fault.accent, transition);
      const glowAlpha = (state.faultFromClass ? 1 - transition : 0) + (state.faultClass ? transition : 0);
      const crankPin = (i) => {
        const angle = state.angle + cylinderPhases[i];
        // Screen coordinates have Y increasing downward; negating X makes this orbit clockwise.
        return { x: xs[i] - radius * Math.sin(angle), y: crankY + radius * Math.cos(angle) };
      };
      const pistonY = (i) => {
        const pin = crankPin(i), offset = pin.x - xs[i];
        return pin.y - Math.sqrt(Math.max(0, rodLength ** 2 - offset ** 2));
      };
      const line = (x1,y1,x2,y2,color,w=1) => { context.strokeStyle=color; context.lineWidth=w; context.lineCap='round'; context.beginPath(); context.moveTo(x1,y1); context.lineTo(x2,y2); context.stroke(); };
      context.save(); context.translate(260, 148); context.scale(.78, .78); context.translate(-260, -148);
      context.fillStyle='rgba(8,22,30,.62)';context.beginPath();context.roundRect(40,43,440,98,8);context.fill();
      context.fillStyle='rgba(5,18,26,.97)';context.beginPath();context.roundRect(49,136,422,104,10);context.fill();
      // Compact upper block meets a single open crankcase; rod slots are only in the shared lip.
      line(48,43,472,43,'rgba(134,219,209,.58)',1.8);line(40,51,40,128,'rgba(134,219,209,.58)',1.8);line(480,51,480,128,'rgba(134,219,209,.58)',1.8);
      line(40,51,48,43,'rgba(134,219,209,.58)',1.8);line(472,43,480,51,'rgba(134,219,209,.58)',1.8);line(40,128,49,137,'rgba(134,219,209,.58)',1.8);line(471,137,480,128,'rgba(134,219,209,.58)',1.8);
      const drawRailWithRodClearance = (left,right,y,color,width) => {
        let cursor=left;
        for(const center of xs){const opening=29,gapStart=center-opening,gapEnd=center+opening;if(gapStart>cursor)line(cursor,y,gapStart,y,color,width);cursor=gapEnd;}
        if(cursor<right)line(cursor,y,right,y,color,width);
      };
      drawRailWithRodClearance(49,471,136,'rgba(102,185,179,.62)',1.9);
      line(49,146,49,230,'rgba(102,185,179,.62)',1.9);line(471,146,471,230,'rgba(102,185,179,.62)',1.9);line(49,146,59,136,'rgba(102,185,179,.62)',1.9);line(461,136,471,146,'rgba(102,185,179,.62)',1.9);line(49,230,59,240,'rgba(102,185,179,.62)',1.9);line(461,240,471,230,'rgba(102,185,179,.62)',1.9);line(59,240,461,240,'rgba(102,185,179,.62)',1.9);
      line(58,crankY,462,crankY,'rgba(37,98,103,.86)',10);
      line(58,crankY,462,crankY,'#76d5c8',3.4);
      for(let i=0;i<4;i++){context.strokeStyle='#b5eee4';context.lineWidth=1.7;context.fillStyle='#173f4a';context.beginPath();context.arc(xs[i],crankY,6,0,Math.PI*2);context.fill();context.stroke();}
      const hits=[];
      for(let i=0;i<4;i++){
        const x=xs[i], active=state.hoverCylinder===i, spark=Math.max(0,(state.sparks[i]-now)/125);
        const tdc=[0,Math.PI*3,Math.PI,Math.PI*2][i], fourPi=Math.PI*4;
        const tdcDelta=((state.angle-tdc+Math.PI*2)%fourPi+fourPi)%fourPi-Math.PI*2;
        const thermal=Math.pow(Math.max(0,1-Math.abs(tdcDelta)/.9),2);
        context.fillStyle='rgba(14,35,43,.82)';context.fillRect(x-22,49,44,88);
        if(thermal>0&&state.faultClass!==0){
          const heat=context.createRadialGradient(x,53,1,x,53,state.faultClass===2?31:25);
          heat.addColorStop(0,glowColor);heat.addColorStop(.42,glowColor);heat.addColorStop(1,'rgba(255,55,35,0)');
          context.globalAlpha=Math.min(1,thermal*.86*glowAlpha);context.fillStyle=heat;context.fillRect(x-27,46,54,42);context.globalAlpha=1;
        }
        const sleeveColor=active?'#e9fff4':(state.faultClass===3&&spark>0?'#f0d34a':(glowAlpha>0?mixHex('#75dcd2',glowColor,glowAlpha):'rgba(117,220,210,.8)'));
        context.strokeStyle=sleeveColor;context.lineWidth=active?2.8:2;
        context.beginPath();context.moveTo(x-23,48);context.lineTo(x-23,137);context.moveTo(x+23,48);context.lineTo(x+23,137);context.moveTo(x-23,48);context.lineTo(x+23,48);context.stroke();
        line(x-17,52,x-17,132,'rgba(177,235,225,.48)');line(x+17,52,x+17,132,'rgba(177,235,225,.48)');
        context.fillStyle='#9ac9c6';context.font='7px ui-monospace,monospace';context.textAlign='center';context.fillText(`CYL ${i+1}`,x,39);
        if(spark>0&&!(state.faultClass===3&&state.sparkSkipped[i])){context.globalAlpha=spark;context.fillStyle=glowColor;context.shadowColor=glowColor;context.shadowBlur=14;context.beginPath();context.arc(x,53,4+4*spark,0,Math.PI*2);context.fill();context.shadowBlur=0;context.globalAlpha=1;line(x-8,53,x+8,53,'#fff2d4',1.2);}
        const headY=pistonY(i), pin=crankPin(i);
        // Crank web and slim rod meet only at their shared moving crank pin.
        line(x,crankY,pin.x,pin.y,'rgba(8,25,31,.96)',9);
        line(x,crankY,pin.x,pin.y,'#49a7a0',4);
        line(x,headY,pin.x,pin.y,'rgba(8,25,31,.98)',7);
        line(x,headY,pin.x,pin.y,'#b8eee5',3.1);
        context.fillStyle='#4eaaa3';context.strokeStyle=active?'#effff5':'#b8f1e7';context.lineWidth=1.8;context.fillRect(x-19,headY-6,38,12);context.strokeRect(x-19,headY-6,38,12);line(x-17,headY-3,x+17,headY-3,'rgba(235,255,248,.68)',1.3);
        hits.push({left:x-29,right:x+29,top:47,bottom:175});
        context.fillStyle='#e8fff7';context.beginPath();context.arc(x,headY,2.2,0,Math.PI*2);context.fill();
        context.fillStyle='#286e70';context.beginPath();context.arc(pin.x,pin.y,4.4,0,Math.PI*2);context.fill();context.strokeStyle='#d0fff3';context.lineWidth=1.8;context.stroke();
      }
      for(let i=0;i<4;i++){context.fillStyle='#286e70';context.beginPath();context.arc(xs[i],crankY,5.2,0,Math.PI*2);context.fill();context.strokeStyle='#d0fff3';context.lineWidth=2;context.stroke();context.fillStyle='#cffff2';context.beginPath();context.arc(xs[i],crankY,1.8,0,Math.PI*2);context.fill();}
      context.restore();
      context.textAlign='left';context.fillStyle='rgba(5,15,22,.9)';context.fillRect(10,5,275,29);context.font='9px ui-monospace,monospace';context.fillStyle='#c7ece6';context.fillText(`ENGINEFAULTDB // CLASS ${state.faultClass} [${fault.name}]`,17,16);context.fillStyle='#9ecbc5';context.fillText(`LAMBDA ${fault.lambda}   AFR ${fault.afr}`,17,28);
      const bad=state.faultClass!==0;context.globalAlpha=bad ? .72+.28*(.5+.5*Math.sin(now/190)) : 1;context.fillStyle=state.faultClass===3?'#f0d34a':bad?'#ff7771':'#64d3b0';context.fillText(bad?'● FAULT DETECTED':'● NOMINAL',381,16);context.globalAlpha=1;context.fillStyle='#89aaa9';context.textAlign='right';context.fillText(`${Math.round(state.rpm)} RPM`,503,28);context.textAlign='left';
      if(state.hoverCylinder!==null){const i=state.hoverCylinder,tdc=[0,Math.PI*3,Math.PI,Math.PI*2][i],cycle=((state.angle-tdc)%(Math.PI*4)+Math.PI*4)%(Math.PI*4),names=['POWER','EXHAUST','INTAKE','COMPRESSION'],phase=names[Math.min(3,Math.floor(cycle/Math.PI))];context.fillStyle='#e3fff5';context.fillText(`CYL ${i+1} // ${phase}`,292,28);}
      state.hitboxes=hits.map((box) => ({ left: 260 + (box.left - 260) * .78, right: 260 + (box.right - 260) * .78, top: 148 + (box.top - 148) * .78, bottom: 148 + (box.bottom - 148) * .78 }));
    };    const stopGraphic = () => {
      if (graphicFrame) window.cancelAnimationFrame(graphicFrame);
      graphicFrame = 0;
      if (graphicGeometry?.isConnected) graphicGeometry.remove();
      graphicGeometry = null;
      if (cashflowCanvasState) {
        const { canvas, intersectionObserver, resizeObserver, onMove, onLeave, onSpike, spikeTimer } = cashflowCanvasState;
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('click', onSpike);
        window.clearTimeout(spikeTimer);
        intersectionObserver?.disconnect();
        resizeObserver?.disconnect();
        cashflowCanvasState = null;
      }
      if (engineCanvasState) {
        const { card, canvas, intersectionObserver, resizeObserver, onEnter, onLeave, onCanvasMove, onCanvasLeave } = engineCanvasState;
        card.removeEventListener('pointerenter', onEnter);
        card.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('pointermove', onCanvasMove);
        canvas.removeEventListener('pointerleave', onCanvasLeave);
        intersectionObserver?.disconnect();
        resizeObserver?.disconnect();
        engineCanvasState = null;
      }
      if (activeGraphicCard) {
        activeGraphicCard.querySelectorAll('.graphic-marker').forEach((marker) => marker.removeAttribute('transform'));
        activeGraphicCard.classList.remove('is-animating');
      }
      activeGraphicCard = null;
    };
    const startGraphic = (card) => {
      stopGraphic();
      card.classList.add('is-animating');
      const cashflowCanvas = card.querySelector('.card-preview canvas.cashflow-canvas');
      if (cashflowCanvas) {
        activeGraphicCard = card;
        const state = { card, canvas: cashflowCanvas, context: cashflowCanvas.getContext('2d'), visible: false, hoverCategory: null, pointerX: 0, pointerY: 0, motionTime: 0, lastFrameTime: 0, particles: cashflowCategories.map(() => []), nextSpawnAt: cashflowCategories.map(() => Math.random() * 260), spikeAt: 0, spikeCategory: -1, spikeTimer: 0, intersectionObserver: null, resizeObserver: null };
        cashflowCanvasState = state;
        const schedule = () => {
          if (state.visible && !projectMotionPreference.matches && !graphicFrame) graphicFrame = window.requestAnimationFrame(tick);
        };
        const tick = (time) => {
          graphicFrame = 0;
          if (cashflowCanvasState !== state || !state.visible || !card.isConnected) return;
          const elapsed = state.lastFrameTime ? Math.min(64, time - state.lastFrameTime) : 0;
          state.lastFrameTime = time;
          state.motionTime += elapsed;
          drawCashflowCanvas(state, time);
          if (!projectMotionPreference.matches) graphicFrame = window.requestAnimationFrame(tick);
        };
        const pointFromEvent = (event) => {
          const rect = cashflowCanvas.getBoundingClientRect();
          return { x: (event.clientX - rect.left) / rect.width * 640, y: (event.clientY - rect.top) / rect.height * 320 };
        };
        const hitCategoryAt = (point, allowNearest = false) => {
          for (let index = 0; index < cashflowCategories.length; index++) {
            const centerY = [62, 128, 207, 275][index];
            if (point.x >= 500 && point.x <= 632 && point.y >= centerY - 22 && point.y <= centerY + 22) return index;
          }
          let nearest = -1, nearestDistance = Infinity;
          cashflowCategories.forEach((category, index) => {
            for (let sample = 3; sample <= 40; sample++) {
              const conduit = cashflowPoint(index, sample / 40);
              const distance = Math.hypot(conduit.x - point.x, conduit.y - point.y);
              if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
            }
          });
          return nearestDistance <= (allowNearest ? 54 : 30) ? nearest : null;
        };
        state.onMove = (event) => {
          const point = pointFromEvent(event);
          state.pointerX = point.x; state.pointerY = point.y;
          state.hoverCategory = hitCategoryAt(point);
          drawCashflowCanvas(state);
        };
        state.onLeave = () => { state.hoverCategory = null; drawCashflowCanvas(state); };
        state.onSpike = (event) => {
          const point = pointFromEvent(event);
          const nearest = hitCategoryAt(point, true);
          if (nearest === null) return;
          state.spikeAt = performance.now();
          state.spikeCategory = nearest;
          drawCashflowCanvas(state, state.spikeAt);
          schedule();
          window.clearTimeout(state.spikeTimer);
          state.spikeTimer = window.setTimeout(() => {
            if (cashflowCanvasState !== state) return;
            state.spikeAt = 0; state.spikeCategory = -1; drawCashflowCanvas(state);
          }, 1500);
        };
        cashflowCanvas.addEventListener('pointermove', state.onMove);
        cashflowCanvas.addEventListener('pointerleave', state.onLeave);
        cashflowCanvas.addEventListener('click', state.onSpike);
        state.intersectionObserver = new IntersectionObserver((entries) => {
          state.visible = entries.some((entry) => entry.isIntersecting);
          if (state.visible) { state.lastFrameTime = 0; schedule(); }
          else { state.lastFrameTime = 0; if (graphicFrame) { window.cancelAnimationFrame(graphicFrame); graphicFrame = 0; } }
        }, { threshold: .05 });
        state.intersectionObserver.observe(cashflowCanvas);
        state.resizeObserver = new ResizeObserver(() => { drawCashflowCanvas(state); schedule(); });
        state.resizeObserver.observe(cashflowCanvas);
        drawCashflowCanvas(state);
        return;
      }
      const engineCanvas = card.querySelector('.card-preview canvas.engine-graphic');
      if (engineCanvas) {
        activeGraphicCard = card;
        const controls = card.querySelectorAll('.engine-fault-controls [data-fault-class]');
        const state = { card, canvas: engineCanvas, context: engineCanvas.getContext('2d'), angle: 0, rpm: 1200, targetRpm: 1200, lastTime: 0, visible: false, sparks: Array(4).fill(0), sparkSkipped: Array(4).fill(false), faultClass: 0, faultFromClass: 0, faultChangedAt: performance.now(), nextFaultAt: performance.now() + 2200, hoverCylinder: null, stutterUntil: 0, intersectionObserver: null, resizeObserver: null };
        engineCanvasState = state;
        engineCanvas.dataset.faultClass = '0';
        controls.forEach((control) => control.setAttribute('aria-current', String(control.dataset.faultClass === '0')));
        const setFaultClass = (faultClass, time) => {
          if (faultClass === state.faultClass) return;
          state.faultFromClass = state.faultClass;
          state.faultClass = faultClass;
          state.faultChangedAt = time;
          engineCanvas.dataset.faultClass = String(faultClass);
          controls.forEach((control) => control.setAttribute('aria-current', String(Number(control.dataset.faultClass) === faultClass)));
        };
        const tick = (time) => {
          graphicFrame = 0;
          if (engineCanvasState !== state || !state.visible || !card.isConnected) return;
          const elapsed = state.lastTime ? Math.min(64, time - state.lastTime) : 0;
          state.lastTime = time;
          if (time >= state.nextFaultAt) {
            const choices = [0, 1, 2, 3].filter((faultClass) => faultClass !== state.faultClass);
            setFaultClass(choices[Math.floor(Math.random() * choices.length)], time);
            state.nextFaultAt = time + 5600 + Math.random() * 3200;
          }
          const ease = 1 - Math.exp(-elapsed / 420);
          state.rpm += (state.targetRpm - state.rpm) * ease;
          const previousAngle = state.angle;
          const hesitation = state.stutterUntil > time ? .72 : 1;
          const angleDelta = elapsed * state.rpm * .00135 / 1000 * hesitation;
          state.angle = (state.angle + angleDelta) % (Math.PI * 4);
          [0, Math.PI, Math.PI * 2, Math.PI * 3].forEach((tdc, firingIndex) => {
            const distance = (tdc - previousAngle + Math.PI * 4) % (Math.PI * 4);
            if (angleDelta > 0 && distance <= angleDelta + .0001) {
              const cylinder = firingOrder[firingIndex];
              state.sparkSkipped[cylinder] = state.faultClass === 3 && Math.random() < .42;
              state.sparks[cylinder] = time + 125;
              if (state.faultClass === 3 && state.sparkSkipped[cylinder]) state.stutterUntil = time + 110;
            }
          });
          drawI4Canvas(state);
          if (!projectMotionPreference.matches) graphicFrame = window.requestAnimationFrame(tick);
        };
        const schedule = () => {
          if (state.visible && !graphicFrame) graphicFrame = window.requestAnimationFrame(tick);
        };
        state.onEnter = () => { state.targetRpm = 2000; };
        state.onLeave = () => { state.targetRpm = 1200; };
        card.addEventListener('pointerenter', state.onEnter);
        card.addEventListener('pointerleave', state.onLeave);
        state.onCanvasMove = (event) => {
          const rect = engineCanvas.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width * 520;
          const y = (event.clientY - rect.top) / rect.height * 250;
          const index = state.hitboxes?.findIndex((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) ?? -1;
          state.hoverCylinder = index >= 0 ? index : null;
          engineCanvas.dataset.hoverCylinder = state.hoverCylinder === null ? '' : String(state.hoverCylinder + 1);
          drawI4Canvas(state);
        };
        state.onCanvasLeave = () => { state.hoverCylinder = null; engineCanvas.dataset.hoverCylinder = ''; drawI4Canvas(state); };
        engineCanvas.addEventListener('pointermove', state.onCanvasMove);
        engineCanvas.addEventListener('pointerleave', state.onCanvasLeave);
        state.intersectionObserver = new IntersectionObserver((entries) => {
          state.visible = entries.some((entry) => entry.isIntersecting);
          if (state.visible) schedule();
          else if (graphicFrame) { window.cancelAnimationFrame(graphicFrame); graphicFrame = 0; }
        }, { threshold: .05 });
        state.intersectionObserver.observe(engineCanvas);
        state.resizeObserver = new ResizeObserver(() => {
          drawI4Canvas(state);
          schedule();
        });
        state.resizeObserver.observe(engineCanvas);
        if (card.matches(':hover')) state.targetRpm = 2000;
        if (projectMotionPreference.matches) {
          state.visible = true;
          drawI4Canvas(state);
        } else {
          // Draw a crisp initial frame while IntersectionObserver reports visibility.
          drawI4Canvas(state);
        }
        return;
      }
      const svg = card.querySelector('.card-preview svg');
      if (projectMotionPreference.matches) return;
      const marker = svg?.querySelector('.graphic-marker');
      const motion = marker?.querySelector('animateMotion');
      if (!svg || !marker || !motion) return;
      const routeReference = motion.querySelector('mpath')?.getAttribute('href');
      const routeId = routeReference?.slice(1);
      const routeSource = routeId ? svg.querySelector(`#${routeId}`) : null;
      const routeData = motion.getAttribute('path') || routeSource?.getAttribute('d');
      if (!routeData) return;
      const geometry = document.createElementNS(svgNamespace, 'path');
      geometry.setAttribute('d', routeData);
      geometry.setAttribute('visibility', 'hidden');
      svg.append(geometry);
      const length = geometry.getTotalLength();
      if (!length) { geometry.remove(); return; }
      graphicGeometry = geometry;
      activeGraphicCard = card;
      const duration = Math.max(.5, Number.parseFloat(motion.getAttribute('dur')) || 3) * 1000;
      const startedAt = performance.now();

      const animate = (time) => {
        if (activeGraphicCard !== card || !card.isConnected) return;
        const distance = ((time - startedAt) % duration) / duration * length;
        const point = geometry.getPointAtLength(distance);
        marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
        graphicFrame = window.requestAnimationFrame(animate);
      };
      graphicFrame = window.requestAnimationFrame(animate);
    };
    const selectProject = (index) => {
      const card = cards[index];
      if (!card || card.hidden) return;
      if (activeProjectCard && activeProjectCard !== card) {
        stopGraphic();
        activeProjectCard.classList.remove('is-current', 'is-animating');
        track.append(activeProjectCard);
      }
      projectStage.replaceChildren(card);
      activeProjectCard = card;
      card.classList.add('is-current', 'visible');
      card.classList.remove('is-animating');
      projectStage.setAttribute('aria-labelledby', tabButtons[index].id);
      tabButtons.forEach((button, buttonIndex) => {
        const selected = buttonIndex === index;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      startGraphic(card);
    };
    projectFilters.forEach((filter) => {
      filter.addEventListener('click', () => {
        const selectedType = filter.dataset.projectFilter;
        projectFilters.forEach((button) => button.setAttribute('aria-pressed', String(button === filter)));
        cards.forEach((card, index) => {
          const matches = selectedType === 'all' || card.dataset.projectType === selectedType;
          card.hidden = !matches;
          tabButtons[index].hidden = !matches;
        });
        const firstVisible = cards.findIndex((card) => !card.hidden);
        if (firstVisible >= 0) selectProject(firstVisible);
      });
    });
    projectMotionPreference.addEventListener('change', () => {
      if (activeProjectCard) startGraphic(activeProjectCard);
    });
    selectProject(0);
    const portraitCanvas = document.getElementById('portrait-canvas');
    const portraitContext = portraitCanvas.getContext('2d');
    const portraitFrame = document.querySelector('.portrait-frame');
    const portraitImageSource = 'Gemini_Generated_Image_t4bvo7t4bvo7t4bv-removebg-previewz11111.png';
    const portraitState = { particles: [], pointerX: -1000, pointerY: -1000, pointerVX: 0, pointerVY: 0, previousPointerX: -1000, previousPointerY: -1000, previousPointerTime: 0, image: null, width: 0, height: 0, frame: 0, assemblyStartedAt: 0, hasBursted: false, discombobulating: false, reducedMotion: false };
    let nameTypingFinished = false;
    const drawPortraitSource = (image) => {
      const source = document.createElement('canvas');
      const context = source.getContext('2d', { willReadFrequently: true });
      source.width = 160;
      source.height = 200;
      const cropWidth = image.naturalWidth * .86;
      const cropHeight = cropWidth * source.height / source.width;
      const cropX = (image.naturalWidth - cropWidth) / 2;
      context.drawImage(image, cropX, 0, cropWidth, cropHeight, 0, 0, source.width, source.height);

      return context.getImageData(0, 0, source.width, source.height);
    };

    const renderPortrait = () => {
      const { particles, width, height, pointerX, pointerY } = portraitState;
      const now = performance.now();
      portraitContext.clearRect(0, 0, width, height);
      for (const particle of particles) {
        let targetX = particle.baseX;
        let targetY = particle.baseY;
        const progress = portraitState.discombobulating
          ? 1
          : portraitState.reducedMotion
          ? 1
          : portraitState.assemblyStartedAt
            ? Math.max(0, Math.min(1, (now - portraitState.assemblyStartedAt - particle.delay) / particle.duration))
            : 0;

        if (progress < 1) {
          if (progress < .24) {
            const burstProgress = progress / .24;
            const eased = 1 - Math.pow(1 - burstProgress, 3);
            targetX = particle.startX + (particle.burstX - particle.startX) * eased;
            targetY = particle.startY + (particle.burstY - particle.startY) * eased;
          } else {
            const settleProgress = (progress - .24) / .76;
            const eased = settleProgress * settleProgress * (3 - 2 * settleProgress);
            targetX = particle.burstX + (particle.baseX - particle.burstX) * eased;
            targetY = particle.burstY + (particle.baseY - particle.burstY) * eased
              + Math.sin(settleProgress * Math.PI) * particle.settle;
          }
        } else {
          const dx = particle.x - pointerX;
          const dy = particle.y - pointerY;
          const distance = Math.hypot(dx, dy);
          if (distance > 0) {
            const force = Math.exp(-Math.pow(distance / 92, 2));
            const directionX = dx / distance;
            const directionY = dy / distance;
            particle.vx += directionX * force * 1.15 - directionY * force * .3 + portraitState.pointerVX * force * .025;
            particle.vy += directionY * force * 1.15 + directionX * force * .3 + portraitState.pointerVY * force * .025;
          }
          particle.vx += (targetX - particle.x) * .02;
          particle.vy += (targetY - particle.y) * .02;
          particle.vx *= .89;
          particle.vy *= .89;
          const speed = Math.hypot(particle.vx, particle.vy);
          if (speed > 13) {
            particle.vx = particle.vx / speed * 13;
            particle.vy = particle.vy / speed * 13;
          }
          targetX = particle.x + particle.vx;
          targetY = particle.y + particle.vy;
        }

        if (progress < 1) {
          particle.x += (targetX - particle.x) * .2;
          particle.y += (targetY - particle.y) * .2;
        } else {
          particle.x = targetX;
          particle.y = targetY;
        }
        const assemblyOpacity = portraitState.assemblyStartedAt ? Math.min(1, progress * 12) : 0;
        portraitContext.globalAlpha = particle.alpha * assemblyOpacity;
        portraitContext.fillStyle = particle.color;
        portraitContext.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
      portraitContext.globalAlpha = 1;
      portraitState.frame = requestAnimationFrame(renderPortrait);
    };

    const beginPortraitAssembly = () => {
      if (!portraitState.particles.length || portraitState.assemblyStartedAt || portraitState.hasBursted || portraitState.reducedMotion) return;
      const caretBounds = document.querySelector('.name-caret').getBoundingClientRect();
      const canvasBounds = portraitCanvas.getBoundingClientRect();
      const originX = caretBounds.left + caretBounds.width / 2 - canvasBounds.left;
      const originY = caretBounds.top + caretBounds.height / 2 - canvasBounds.top;
      const burstRadius = Math.hypot(portraitState.width, portraitState.height) * .52;

      portraitState.particles.forEach((particle) => {
        const angle = Math.random() * Math.PI * 2;
        const radius = 35 + Math.random() * burstRadius;
        particle.startX = originX;
        particle.startY = originY;
        particle.burstX = Math.max(0, Math.min(portraitState.width, originX + Math.cos(angle) * radius));
        particle.burstY = Math.max(0, Math.min(portraitState.height, originY + Math.sin(angle) * radius));
        particle.x = originX;
        particle.y = originY;
      });

      portraitState.assemblyStartedAt = performance.now();
      portraitState.hasBursted = true;
    };

    const loadPortrait = () => {
      const image = new Image();
      image.onload = () => {
        const pixels = drawPortraitSource(image);
        portraitState.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        portraitCanvas.style.width = `${document.documentElement.clientWidth}px`;
        const canvasBounds = portraitCanvas.getBoundingClientRect();
        const frameBounds = portraitFrame.getBoundingClientRect();
        const canvasWidth = portraitCanvas.clientWidth;
        const canvasHeight = portraitCanvas.clientHeight;
        const scale = Math.min(frameBounds.width / 160, frameBounds.height / 200);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        portraitCanvas.width = Math.round(canvasWidth * dpr);
        portraitCanvas.height = Math.round(canvasHeight * dpr);
        portraitState.width = canvasWidth;
        portraitState.height = canvasHeight;
        portraitContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        const displayWidth = 160 * scale;
        const displayHeight = 200 * scale;
        const offsetX = frameBounds.left - canvasBounds.left + (frameBounds.width - displayWidth) / 2;
        const offsetY = frameBounds.top - canvasBounds.top + (frameBounds.height - displayHeight) / 2;
        const particles = [];

        for (let y = 1; y < 200; y += 2) {
          for (let x = 1; x < 160; x += 2) {
            const pixel = (y * 160 + x) * 4;
            const red = pixels.data[pixel];
            const green = pixels.data[pixel + 1];
            const blue = pixels.data[pixel + 2];
            const sourceAlpha = pixels.data[pixel + 3] / 255;
            if (sourceAlpha < .1) continue;
            const brightness = (red * .299 + green * .587 + blue * .114) * sourceAlpha;
            const baseX = offsetX + x * scale;
            const baseY = offsetY + y * scale;
            particles.push({
              baseX,
              baseY,
              startX: baseX,
              startY: baseY,
              burstX: baseX,
              burstY: baseY,
              x: baseX,
              y: baseY,
              vx: 0,
              vy: 0,
              delay: Math.random() * 180,
              duration: 1250 + Math.random() * 600,
              settle: 4 + Math.random() * 14,
              size: scale * (1.1 + brightness / 400),
              alpha: Math.pow(brightness / 255, 1.35),
              color: '#7fe5b0'
            });
          }
        }

        portraitState.particles = particles;
        portraitState.pointerX = -1000;
        portraitState.pointerY = -1000;
        portraitState.assemblyStartedAt = portraitState.reducedMotion || portraitState.hasBursted ? performance.now() : 0;
        if (nameTypingFinished) beginPortraitAssembly();
      };
      image.src = portraitImageSource;
    };

    loadPortrait();
    renderPortrait();
    let portraitResizeTimer;
    let lastPortraitWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastPortraitWidth) < 50) return;
      lastPortraitWidth = window.innerWidth;
      window.clearTimeout(portraitResizeTimer);
      portraitResizeTimer = window.setTimeout(loadPortrait, 120);
    }, { passive: true });

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const heading = document.getElementById('hero-title');
      const nameLines = [heading.querySelector('.name-first'), heading.querySelector('.name-last')];
      heading.setAttribute('aria-label', "Hi, I'm Varad");

      const pause = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
      const lettersByLine = nameLines.map((line) => {
        const letters = Array.from(line.textContent.trim(), (character) => {
          const letter = document.createElement('span');
          letter.className = 'name-letter';
          letter.textContent = character;
          return letter;
        });
        line.setAttribute('aria-hidden', 'true');
        line.replaceChildren(...letters);
        return letters;
      });

      const typeName = async () => {
        await pause(180);
        for (const letter of lettersByLine.flat()) {
          letter.classList.add('shown', 'typing');
          await pause(95);
          letter.classList.remove('typing');
        }
        document.querySelector('.name-caret').classList.add('visible');
        nameTypingFinished = true;
        beginPortraitAssembly();
      };

      typeName();
    }
    window.addEventListener('scroll', () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${scrollable > 0 ? window.scrollY / scrollable * 100 : 0}%`;
      backTop.classList.toggle('visible', window.scrollY > 600);
    }, { passive: true });
    backTop.classList.toggle('visible', window.scrollY > 600);

    const updateNavIndicator = (sectionId) => {
      const activeLink = navLinks.find((link) => link.hash === `#${sectionId}`);
      if (!activeLink) return;
      navLinks.forEach((link) => {
        if (link === activeLink) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      const navBounds = nav.getBoundingClientRect();
      const linkBounds = activeLink.getBoundingClientRect();
      nav.style.setProperty('--nav-line-left', `${linkBounds.left - navBounds.left}px`);
      nav.style.setProperty('--nav-line-width', `${linkBounds.width}px`);
    };

    navLinks.forEach((link) => link.addEventListener('click', () => updateNavIndicator(link.hash.slice(1))));
    const setMobileNav = (isOpen) => {
      nav.classList.toggle('is-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    };
    navToggle.addEventListener('click', () => setMobileNav(navToggle.getAttribute('aria-expanded') !== 'true'));
    navLinks.forEach((link) => link.addEventListener('click', () => setMobileNav(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        setMobileNav(false);
        navToggle.focus();
      }
    });
    updateNavIndicator(navLinks.some((link) => link.hash === window.location.hash) ? window.location.hash.slice(1) : 'about');
    window.addEventListener('resize', () => {
      const activeLink = navLinks.find((link) => link.getAttribute('aria-current') === 'location') || navLinks[0];
      updateNavIndicator(activeLink.hash.slice(1));
    }, { passive: true });

    const sectionObserver = new IntersectionObserver((entries) => {
      const visibleSection = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visibleSection) updateNavIndicator(visibleSection.target.id);
    }, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
    document.querySelectorAll('.section[id]').forEach((section) => sectionObserver.observe(section));

    window.addEventListener('pointermove', (event) => {
      glow.style.left = `${event.clientX}px`;
      glow.style.top = `${event.clientY}px`;
      const canvasBounds = portraitCanvas.getBoundingClientRect();
      if (event.clientX >= canvasBounds.left && event.clientX <= canvasBounds.right
        && event.clientY >= canvasBounds.top && event.clientY <= canvasBounds.bottom) {
        const pointerX = event.clientX - canvasBounds.left;
        const pointerY = event.clientY - canvasBounds.top;
        const elapsed = Math.max(8, event.timeStamp - portraitState.previousPointerTime);
        if (portraitState.previousPointerX >= 0) {
          const sampleVX = (pointerX - portraitState.previousPointerX) * 16 / elapsed;
          const sampleVY = (pointerY - portraitState.previousPointerY) * 16 / elapsed;
          portraitState.pointerVX = portraitState.pointerVX * .55 + Math.max(-28, Math.min(28, sampleVX)) * .45;
          portraitState.pointerVY = portraitState.pointerVY * .55 + Math.max(-28, Math.min(28, sampleVY)) * .45;
        }
        portraitState.pointerX = pointerX;
        portraitState.pointerY = pointerY;
        portraitState.previousPointerX = pointerX;
        portraitState.previousPointerY = pointerY;
        portraitState.previousPointerTime = event.timeStamp;
      } else {
        portraitState.pointerX = -1000;
        portraitState.pointerY = -1000;
        portraitState.pointerVX = 0;
        portraitState.pointerVY = 0;
        portraitState.previousPointerX = -1000;
        portraitState.previousPointerY = -1000;
        portraitState.previousPointerTime = event.timeStamp;
      }
      if (finePointer.matches) {
        const pointerIsVisible = event.clientX >= 0 && event.clientX <= window.innerWidth && event.clientY >= 0 && event.clientY <= window.innerHeight;
        for (const cursor of [cursorRing, cursorDot]) {
          cursor.style.left = `${event.clientX}px`;
          cursor.style.top = `${event.clientY}px`;
          cursor.style.opacity = pointerIsVisible ? '1' : '0';
        }
      }
    }, { passive: true });

    document.addEventListener('pointerover', (event) => {
      if (event.target.closest('a, .project-card')) cursorRing.classList.add('active');
    });

    document.addEventListener('pointerout', (event) => {
      if (event.target.closest('a, .project-card')) cursorRing.classList.remove('active');
    });

    if (window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) {
      document.querySelectorAll('.button').forEach((button) => {
        button.addEventListener('pointermove', (event) => {
          const bounds = button.getBoundingClientRect();
          const x = Math.max(-6, Math.min(6, (event.clientX - bounds.left - bounds.width / 2) * 0.08));
          const y = Math.max(-6, Math.min(6, (event.clientY - bounds.top - bounds.height / 2) * 0.08));
          button.style.setProperty('--mag-x', `${x}px`);
          button.style.setProperty('--mag-y', `${y}px`);
        });
        button.addEventListener('pointerleave', () => {
          button.style.setProperty('--mag-x', '0px');
          button.style.setProperty('--mag-y', '0px');
        });
      });

      document.querySelectorAll('.project-card').forEach((card) => {
        card.addEventListener('pointermove', (event) => {
          const bounds = card.getBoundingClientRect();
          const x = event.clientX - bounds.left;
          const y = event.clientY - bounds.top;
          card.style.setProperty('--pointer-x', `${x}px`);
          card.style.setProperty('--pointer-y', `${y}px`);
        });
      });

      document.querySelectorAll('.skill-card').forEach((card) => {
        card.addEventListener('pointermove', (event) => {
          const bounds = card.getBoundingClientRect();
          card.style.setProperty('--mouse-x', `${event.clientX - bounds.left}px`);
          card.style.setProperty('--mouse-y', `${event.clientY - bounds.top}px`);
        });
      });

      document.addEventListener('click', (event) => {
        const portraitBounds = portraitFrame.getBoundingClientRect();
        const clickedPortrait = event.clientX >= portraitBounds.left && event.clientX <= portraitBounds.right
          && event.clientY >= portraitBounds.top && event.clientY <= portraitBounds.bottom;
        if (clickedPortrait && !portraitState.reducedMotion && portraitState.assemblyStartedAt) {
          portraitState.discombobulating = true;
          const bounds = portraitCanvas.getBoundingClientRect();
          const clickX = event.clientX - bounds.left;
          const clickY = event.clientY - bounds.top;
          portraitState.particles.forEach((particle) => {
            const dx = particle.x - clickX;
            const dy = particle.y - clickY;
            const distance = Math.hypot(dx, dy);
            const angle = distance > .01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
            const force = (5 + Math.random() * 8) * Math.exp(-distance / 360);
            particle.vx += Math.cos(angle) * force + (Math.random() - .5) * 1.8;
            particle.vy += Math.sin(angle) * force + (Math.random() - .5) * 1.8;
          });
        }
        if (event.target.closest('a, button, summary')) return;
        for (let index = 0; index < 8; index += 1) {
          const spark = document.createElement('span');
          const angle = Math.PI * 2 * index / 8 + Math.random() * .25;
          const distance = 18 + Math.random() * 34;
          spark.className = 'spark';
          spark.setAttribute('aria-hidden', 'true');
          spark.style.left = `${event.clientX}px`;
          spark.style.top = `${event.clientY}px`;
          spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
          spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
          document.body.append(spark);
          spark.addEventListener('animationend', () => spark.remove(), { once: true });
        }
      });
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (entry.target.classList.contains('project-card')) {
            const projectIndex = cards.indexOf(entry.target) + 1;
            entry.target.style.setProperty('--reveal-delay', `${projectIndex * 90}ms`);
          }
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
