// ============================================================
//  SECTION: JOB MINIGAME UI – v2 real tasks
// ============================================================

import type { JobType, JobSkill, JobLicense } from '../../../shared/economy';
import { TRASH_FRACTIONS, TRASH_SORT_ITEMS, COURIER_DISTRICTS } from '../../../shared/economy';

export type JobStartCallback = (score: number, details?: any) => void;
export type TrainingBuyCallback = (courseId: string) => void;

export class JobMinigameUI {
  private root?: HTMLDivElement;

  destroy(): void {
    this.root?.remove();
    this.root = undefined;
  }

  // --- Школа ---
  showSchool(
    money: number,
    skills: Record<JobType, JobSkill>,
    licenses: JobLicense,
    completed: string[],
    onBuy: TrainingBuyCallback,
    onClose: () => void
  ): void {
    this.destroy();
    const root = document.createElement('div');
    root.id = 'job-school-ui';
    root.style.cssText = `position:fixed;inset:0;background:rgba(10,12,18,0.88);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;`;
    root.innerHTML = `
      <div style="background:#161b22;border:1px solid #30363d;border-radius:16px;max-width:860px;width:95%;max-height:90vh;overflow:auto;color:#e8eaed;box-shadow:0 20px 60px rgba(0,0,0,.6)">
        <div style="padding:20px 24px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:22px;font-weight:800">🎓 Школа профессий MoneyRoll</div>
            <div style="color:#8a919e;font-size:13px;margin-top:4px">Обучи персонажа – открой высокооплачиваемые работы</div>
          </div>
          <div style="text-align:right">
            <div style="color:#8a919e;font-size:12px">Баланс</div>
            <div style="font-size:20px;font-weight:800;color:#ffd700">$${money.toFixed(2)}</div>
          </div>
        </div>
        <div style="padding:18px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px" id="school-courses"></div>
        <div style="padding:0 24px 18px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#8a919e">
          <span>📦 Курьер: ур. ${skills.courier.level} · XP ${skills.courier.xp} · выполнено ${skills.courier.jobsCompleted}</span>
          <span>♻ Сортировка: ур. ${skills['trash-sort'].level}</span>
          <span>🍋 Лимонад: ур. ${skills.lemonade.level}</span>
          <span>📜 Лицензии: ${licenses.courier ? '🚲' : '❌'} ${licenses.trashSort ? '♻' : '❌'} ${licenses.lemonadeBusiness ? '🍋' : '❌'}</span>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #30363d;text-align:right">
          <button id="school-close" style="background:#21262d;border:1px solid #30363d;color:#e8eaed;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:600">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    const courses = [
      { id:'courier_basic', title:'🚲 Курьер-стажёр', cost:25, desc:'Лицензия курьера. Открывает доставку $8–22/заказ', req:0, owned: licenses.courier },
      { id:'courier_pro', title:'⚡ Скоростная доставка', cost:65, desc:'+35% оплата, бизнес-район', req:2, owned: completed.includes('courier_pro'), skill: skills.courier.level },
      { id:'courier_master', title:'👑 Мастер-логист', cost:140, desc:'+130% оплата, VIP-клиенты', req:5, owned: completed.includes('courier_master'), skill: skills.courier.level },
      { id:'trash_basic', title:'♻ Сортировщик', cost:15, desc:'Сертификат эко-сортировки. $5–14/смена', req:0, owned: licenses.trashSort },
      { id:'trash_expert', title:'☢ Эко-инженер', cost:55, desc:'Опасные отходы +40%', req:3, owned: completed.includes('trash_expert'), skill: skills['trash-sort'].level },
      { id:'lemonade_business', title:'🍋 Лимонадный мастер', cost:80, desc:'Образование продавца лимонада. Открывает работу у точки', req:0, owned: licenses.lemonadeBusiness },
    ];

    const grid = root.querySelector('#school-courses') as HTMLElement;
    courses.forEach(c => {
      const canAfford = money >= c.cost;
      const meetsReq = (c.skill ?? 0) >= (c.req ?? 0);
      const disabled = c.owned || !canAfford || !meetsReq;
      const card = document.createElement('div');
      card.style.cssText = `background:#0d1117;border:1px solid #2b313a;border-radius:12px;padding:14px;`;
      card.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px">${c.title}</div>
        <div style="font-size:13px;color:#aab0bb;margin-bottom:8px;min-height:34px">${c.desc}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:800;color:${canAfford?'#ffd700':'#ff6b6b'}">$${c.cost}</span>
          <button ${disabled?'disabled':''} data-course="${c.id}" style="background:${c.owned?'#263445':canAfford?'#238636':'#3a2a2a'};color:#fff;border:none;padding:7px 12px;border-radius:8px;cursor:${disabled?'not-allowed':'pointer'};font-weight:600;font-size:13px">
            ${c.owned?'✅ Куплено':!meetsReq?`Нужно ур.${c.req}`:!canAfford?'Нет денег':'Купить'}
          </button>
        </div>`;
      grid.appendChild(card);
    });

    grid.querySelectorAll('button[data-course]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.course!;
        onBuy(id);
      });
    });
    root.querySelector('#school-close')?.addEventListener('click', () => { this.destroy(); onClose(); });
    root.addEventListener('click', (e) => { if (e.target === root) { this.destroy(); onClose(); } });
  }

  // --- TRASH SORT MINIGAME ---
  showTrashSort(onFinish: JobStartCallback, onClose: () => void): void {
    this.destroy();
    const items = [...TRASH_SORT_ITEMS].sort(()=>Math.random()-0.5).slice(0,8);
    const root = document.createElement('div');
    root.id = 'trash-minigame';
    root.style.cssText = `position:fixed;inset:0;background:rgba(5,7,10,0.9);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;`;
    root.innerHTML = `
      <div style="background:#11161f;border:1px solid #2d3440;border-radius:18px;width:min(980px,96vw);color:#e8eaed;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid #2d3440;display:flex;justify-content:space-between;align-items:center">
          <div><b>♻ Сортировка мусора – реальная смена</b><div style="font-size:12px;color:#9aa3b2">Перетащи предметы в правильные контейнеры. Время ограничено!</div></div>
          <div><span id="ts-timer" style="font-weight:800;font-size:20px;color:#7cfc00">25</span><span style="color:#888"> сек</span></div>
        </div>
        <div style="padding:16px 20px">
          <div id="ts-items" style="display:flex;flex-wrap:wrap;gap:10px;min-height:90px;margin-bottom:16px;background:#0b0f17;border-radius:12px;padding:12px;border:1px dashed #2b3444"></div>
          <div id="ts-bins" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px"></div>
          <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:13px;color:#aab2c0">
            <span id="ts-progress">0 / ${items.length} отсортировано</span>
            <span id="ts-accuracy">Точность: 100%</span>
          </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid #2d3440;text-align:right">
          <button id="ts-finish" style="background:#238636;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer">Сдать смену [Enter]</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    const itemsEl = root.querySelector('#ts-items') as HTMLElement;
    const binsEl = root.querySelector('#ts-bins') as HTMLElement;
    let correct = 0, totalSorted = 0, errors = 0;
    const timeLimit = 25;
    let timeLeft = timeLimit;
    const timerEl = root.querySelector('#ts-timer') as HTMLElement;

    // render draggable items
    items.forEach((it, idx) => {
      const d = document.createElement('div');
      d.draggable = true;
      d.dataset.fraction = it.fraction;
      d.dataset.idx = String(idx);
      d.style.cssText = 'background:#1b2333;border:1px solid #334055;padding:10px 12px;border-radius:10px;cursor:grab;user-select:none;display:flex;align-items:center;gap:8px;font-size:14px';
      d.innerHTML = `<span style="font-size:20px">${it.emoji}</span><span>${it.name}</span>`;
      d.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', it.fraction + '|' + idx); });
      itemsEl.appendChild(d);
    });

    // render bins
    TRASH_FRACTIONS.forEach(fr => {
      const bin = document.createElement('div');
      bin.dataset.fraction = fr.id;
      bin.style.cssText = `border:2px dashed ${fr.color};border-radius:12px;padding:14px;min-height:90px;background:#0d121c;text-align:center;transition:.15s`;
      bin.innerHTML = `<div style="font-size:28px">${fr.emoji}</div><div style="font-weight:700;color:${fr.color}">${fr.name}</div><div class="bin-count" style="font-size:12px;color:#8190a8;margin-top:4px">0 шт</div>`;
      bin.addEventListener('dragover', e => { e.preventDefault(); bin.style.background='#15202f'; });
      bin.addEventListener('dragleave', () => bin.style.background='#0d121c');
      bin.addEventListener('drop', e => {
        e.preventDefault(); bin.style.background='#0d121c';
        const data = e.dataTransfer?.getData('text/plain'); if(!data) return;
        const [fraction, idxStr] = data.split('|');
        const idx = parseInt(idxStr);
        const el = itemsEl.querySelector(`[data-idx="${idx}"]`) as HTMLElement;
        if (!el || el.style.opacity==='0.35') return;
        totalSorted++;
        const targetFraction = bin.dataset.fraction!;
        const ok = fraction === targetFraction;
        if (ok) correct++; else errors++;
        el.style.opacity='0.35';
        el.style.pointerEvents='none';
        const countEl = bin.querySelector('.bin-count') as HTMLElement;
        const n = parseInt(countEl.textContent||'0')+1;
        countEl.textContent = n + ' шт';
        updateStats();
        if (totalSorted >= items.length) finish();
      });
      binsEl.appendChild(bin);
    });

    const updateStats = () => {
      (root.querySelector('#ts-progress') as HTMLElement).textContent = `${totalSorted} / ${items.length} отсортировано`;
      const acc = totalSorted ? Math.round((correct/totalSorted)*100) : 100;
      (root.querySelector('#ts-accuracy') as HTMLElement).textContent = `Точность: ${acc}%`;
    };

    const timer = setInterval(()=> {
      timeLeft--;
      timerEl.textContent = String(timeLeft);
      timerEl.style.color = timeLeft<8 ? '#ff6b6b' : '#7cfc00';
      if (timeLeft<=0) finish();
    },1000);

    const finish = () => {
      clearInterval(timer);
      const accuracy = totalSorted ? Math.round((correct/totalSorted)*100) : 0;
      const speedBonus = Math.max(0, timeLeft) * 1.5;
      const score = Math.min(100, Math.round(accuracy*0.85 + speedBonus));
      this.destroy();
      onFinish(score, { correct, total: totalSorted, errors });
    };

    root.querySelector('#ts-finish')?.addEventListener('click', finish);
    const keyHandler = (e: KeyboardEvent) => { if(e.key==='Enter'){ document.removeEventListener('keydown', keyHandler); finish(); } if(e.key==='Escape'){ clearInterval(timer); this.destroy(); onClose(); } };
    document.addEventListener('keydown', keyHandler);
  }

  // --- COURIER MINIGAME (legacy, not used anymore) ---
  showCourier(onFinish: JobStartCallback, onClose: () => void): void {
    // Simple courier is now handled directly in WorldScene (parcel → house)
    onFinish(85); // fallback reward if ever called
    this.destroy();
  }
    document.body.appendChild(root);
    this.root = root;
    const stageEl = root.querySelector('#courier-stage') as HTMLElement;
    const progressEl = root.querySelector('#courier-progress') as HTMLElement;

    // Stage 1 – sort
    const districts = [...COURIER_DISTRICTS];
    const packages = Array.from({length:6},(_,i)=> ({
      id:i,
      label: `📦 #${1000+i}`,
      district: districts[Math.floor(Math.random()*districts.length)].id,
      address: `${Math.floor(Math.random()*120)+1} ${['Ленина','Мира','Садовая','Центральная'][Math.floor(Math.random()*4)]}`,
      fragile: Math.random()>.65
    }));
    let sorted=0, correctSort=0;
    const renderSort = ()=>{
      progressEl.style.width='33%';
      stageEl.innerHTML = `
        <div style="margin-bottom:12px;font-weight:600">Сортируй посылки по районам:</div>
        <div id="pkg-pool" style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;background:#0c111b;padding:12px;border-radius:12px;min-height:70px;border:1px dashed #2c3446"></div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px" id="district-bins"></div>
        <div style="margin-top:12px;font-size:13px;color:#aab3c3"><span id="sort-stat">0 / ${packages.length}</span> · <span id="sort-acc">100%</span></div>`;
      const pool = stageEl.querySelector('#pkg-pool') as HTMLElement;
      packages.forEach(p=>{
        const el=document.createElement('div');
        el.draggable=true;
        el.dataset.district=p.district;
        el.dataset.id=String(p.id);
        el.style.cssText='background:#1a2234;border:1px solid #32405a;padding:9px 12px;border-radius:10px;cursor:grab;font-size:13px';
        el.innerHTML=`${p.label} <span style="color:#8b97ad">→ ${p.address}</span> ${p.fragile?'<span style="color:#ff9f43">⚠ хрупкое</span>':''}`;
        el.addEventListener('dragstart',e=>e.dataTransfer?.setData('text',p.district+'|'+p.id));
        pool.appendChild(el);
      });
      const bins = stageEl.querySelector('#district-bins') as HTMLElement;
      districts.forEach(d=>{
        const b=document.createElement('div');
        b.dataset.district=d.id;
        b.style.cssText='border:2px dashed #3a455e;border-radius:12px;padding:14px;background:#0f1420;min-height:80px';
        b.innerHTML=`<div style="font-weight:700">${d.name}</div><div style="font-size:12px;color:#8d97aa">бонус x${d.bonus}</div><div class="dcnt" style="margin-top:6px;font-size:12px;color:#7a889f">0 посылок</div>`;
        b.addEventListener('dragover',e=>e.preventDefault());
        b.addEventListener('drop',e=>{
          e.preventDefault();
          const data=e.dataTransfer?.getData('text'); if(!data) return;
          const [dist,idStr]=data.split('|');
          const el = pool.querySelector(`[data-id="${idStr}"]`) as HTMLElement;
          if(!el || el.style.opacity==='0.4') return;
          sorted++;
          const ok = dist===b.dataset.district;
          if(ok) correctSort++;
          el.style.opacity='0.4'; el.style.pointerEvents='none';
          const cnt = b.querySelector('.dcnt') as HTMLElement;
          cnt.textContent = (parseInt(cnt.textContent||'0')+1)+' посылок';
          stageEl.querySelector('#sort-stat')!.textContent = `${sorted} / ${packages.length}`;
          const acc = Math.round((correctSort/sorted)*100);
          stageEl.querySelector('#sort-acc')!.textContent = acc+'%';
          if(sorted>=packages.length) setTimeout(()=>renderDelivery(),600);
        });
        bins.appendChild(b);
      });
    };

    const renderDelivery = ()=>{
      progressEl.style.width='66%';
      // 3 доставки – выбираем адрес
      const deliveries = packages.slice(0,3);
      let step=0, correctDel=0;
      const next = ()=>{
        if(step>=deliveries.length){
          const sortAcc = Math.round((correctSort/packages.length)*100);
          const delAcc = Math.round((correctDel/deliveries.length)*100);
          const totalScore = Math.round(sortAcc*0.55 + delAcc*0.45);
          progressEl.style.width='100%';
          setTimeout(()=>{ this.destroy(); onFinish(totalScore,{sortAcc,delAcc}); },400);
          return;
        }
        const d = deliveries[step];
        const wrongAddrs = [
          `${Math.floor(Math.random()*90+10)} Пушкина`,
          `${Math.floor(Math.random()*90+10)} Советская`,
          `${Math.floor(Math.random()*90+10)} Молодёжная`,
        ].filter(a=>a!==d.address).slice(0,2);
        const options = [d.address, ...wrongAddrs].sort(()=>Math.random()-0.5);
        stageEl.innerHTML = `
          <div style="margin-bottom:10px;font-weight:600">Этап 2/2 – Доставка ${step+1}/${deliveries.length}</div>
          <div style="background:#0b101a;border:1px solid #2b3448;border-radius:12px;padding:16px;margin-bottom:14px">
            <div style="font-size:15px">📦 Посылка ${d.label} ${d.fragile?'<span style="color:#ff9f43">⚠ ХРУПКОЕ</span>':''}</div>
            <div style="color:#9aab c2;font-size:13px;margin-top:6px">Район: <b>${districts.find(x=>x.id===d.district)?.name}</b> · Нужно доставить по адресу:</div>
            <div style="font-size:18px;font-weight:800;margin-top:8px;color:#7cfc00">❓ Куда везём?</div>
          </div>
          <div style="display:grid;gap:10px">${options.map(opt=>`
            <button class="del-opt" data-addr="${opt}" style="background:#1b2436;border:1px solid #32405d;color:#e8eaed;padding:12px 14px;border-radius:10px;text-align:left;cursor:pointer;font-size:15px">🏠 ${opt}</button>
          `).join('')}</div>
          <div style="margin-top:12px;font-size:12px;color:#8895a8">Правильных: ${correctDel}/${step}</div>
        `;
        stageEl.querySelectorAll('.del-opt').forEach(btn=>{
          btn.addEventListener('click',()=>{
            const addr = (btn as HTMLElement).dataset.addr!;
            const ok = addr===d.address;
            if(ok) correctDel++;
            (btn as HTMLElement).style.background = ok ? '#134e2a' : '#4e1a1a';
            setTimeout(()=>{ step++; next(); }, 550);
          });
        });
      };
      next();
    };

    renderSort();
    const esc = (e:KeyboardEvent)=>{ if(e.key==='Escape'){ document.removeEventListener('keydown',esc); this.destroy(); onClose(); } };
    document.addEventListener('keydown', esc);
  }

  // --- LEMONADE RHYTHM ---
  showLemonade(onFinish: JobStartCallback, onClose: () => void): void {
    this.destroy();
    const root=document.createElement('div');
    root.style.cssText=`position:fixed;inset:0;background:rgba(5,7,10,.92);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif`;
    root.innerHTML=`<div style="background:#131a24;border:1px solid #2b3445;border-radius:18px;width:min(620px,94vw);color:#e8eaed;overflow:hidden;text-align:center">
      <div style="padding:16px 20px;border-bottom:1px solid #2b3445"><b>🍋 Лимонад-ритм</b><div style="font-size:12px;color:#9aa6b8">Жми SPACE / клик когда ползунок в зелёной зоне</div></div>
      <div style="padding:22px">
        <div style="position:relative;height:56px;background:#0b1019;border-radius:12px;border:1px solid #2d3a50;overflow:hidden;margin-bottom:14px">
          <div id="lemon-hit" style="position:absolute;left:42%;width:16%;top:0;bottom:0;background:rgba(34,197,94,.28);border-left:2px solid #22c55e;border-right:2px solid #22c55e"></div>
          <div id="lemon-cursor" style="position:absolute;left:0;top:0;bottom:0;width:4px;background:#ffd700;box-shadow:0 0 10px #ffd700"></div>
        </div>
        <div style="font-size:13px;color:#a8b3c6;margin-bottom:10px">Удар <span id="lemon-beat">0</span> / 12 · Попаданий: <span id="lemon-hits" style="color:#7cfc00">0</span></div>
        <button id="lemon-tap" style="background:linear-gradient(145deg,#facc15,#f59e0b);color:#1a1200;border:none;padding:16px 28px;border-radius:14px;font-weight:800;font-size:18px;cursor:pointer;width:100%">TAP / SPACE 🍋</button>
        <div style="font-size:11px;color:#7f8ca3;margin-top:10px">Рецепт: Классический · идеально = чаевые x1.5</div>
      </div>
    </div>`;
    document.body.appendChild(root); this.root=root;
    let beat=0, hits=0, pos=0, dir=1, running=true;
    let animationFrame = 0;
    let lastFrameAt = performance.now();
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const cursor=root.querySelector('#lemon-cursor') as HTMLElement;
    const beatEl=root.querySelector('#lemon-beat') as HTMLElement;
    const hitsEl=root.querySelector('#lemon-hits') as HTMLElement;

    // Раньше ползунок двигался на 2.2% каждый кадр — попасть было почти невозможно.
    // Скорость теперь задаётся в процентах в секунду и в несколько раз ниже.
    const cursorSpeed = 42;
    const loop=(now: number)=>{
      if(!running) return;
      const elapsed = Math.min(80, now - lastFrameAt) / 1000;
      lastFrameAt = now;
      pos += dir * cursorSpeed * elapsed;
      if(pos>=100 || pos<=0){
        pos = Math.max(0, Math.min(100, pos));
        dir *= -1;
        beat++;
        beatEl.textContent=String(beat);
        if(beat>=12) return finish();
      }
      cursor.style.left=pos+'%';
      animationFrame = requestAnimationFrame(loop);
    };
    const tap=()=>{
      if(!running) return;
      const inZone = pos>=42 && pos<=58;
      if(inZone){
        hits++;
        hitsEl.textContent=String(hits);
        cursor.style.background='#22c55e';
        window.setTimeout(()=>{ if(running) cursor.style.background='#ffd700'; },180);
      } else {
        cursor.style.background='#ef4444';
        window.setTimeout(()=>{ if(running) cursor.style.background='#ffd700'; },180);
      }
    };
    root.querySelector('#lemon-tap')?.addEventListener('click',tap);
    const key=(e:KeyboardEvent)=>{
      if(e.code==='Space'){ e.preventDefault(); tap(); }
      if(e.key==='Escape'){
        running=false;
        cancelAnimationFrame(animationFrame);
        document.removeEventListener('keydown',key);
        if(finishTimer) clearTimeout(finishTimer);
        this.destroy();
        onClose();
      }
    };
    document.addEventListener('keydown',key);
    const finish=()=>{
      if(!running) return;
      running=false;
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown',key);
      if(finishTimer) clearTimeout(finishTimer);
      const score = Math.round((hits/12)*100);
      this.destroy();
      onFinish(score,{hits});
    };
    animationFrame = requestAnimationFrame(loop);
    // Запасной таймер не даёт мини-игре зависнуть во вкладке, потерявшей фокус.
    finishTimer = setTimeout(()=>{ if(running) finish(); },38000);
  }
}
