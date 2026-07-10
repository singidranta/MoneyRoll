// ============================================================
//  SECTION: JOB MINIGAME UI – v2 real tasks
// ============================================================

import type { JobType, JobSkill, JobLicense } from '../../../shared/economy';
import { TRASH_FRACTIONS, TRASH_SORT_ITEMS } from '../../../shared/economy';

export type JobStartCallback = (score: number, details?: any) => void;
export type TrainingBuyCallback = (courseId: string) => void;

export class JobMinigameUI {
  private root?: HTMLDivElement;

  destroy(): void {
    this.root?.remove();
    this.root = undefined;
  }

  // --- School ---
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
            <div style="font-size:22px;font-weight:800;display:flex;align-items:center;gap:10px;">
              <img src="/assets/props/flat/buildings/school_raw.png" width="28" height="28" alt="" />
              Школа профессий
            </div>
            <div style="color:#8a919e;font-size:13px;margin-top:4px">Обучи персонажа - открой высокооплачиваемые работы</div>
          </div>
          <div style="text-align:right">
            <div style="color:#8a919e;font-size:12px">Баланс</div>
            <div style="font-size:20px;font-weight:800;color:#ffd700">$${money.toFixed(2)}</div>
          </div>
        </div>
        <div style="padding:18px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px" id="school-courses"></div>
        <div style="padding:0 24px 18px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#8a919e">
          <span><img src="/assets/icons/courier.webp" width="16" height="16" style="vertical-align:middle;margin-right:4px;" />Курьер: ур. ${skills.courier.level} - XP ${skills.courier.xp}</span>
          <span><img src="/assets/icons/trash-sort.webp" width="16" height="16" style="vertical-align:middle;margin-right:4px;" />Сортировка: ур. ${skills['trash-sort'].level}</span>
          <span><img src="/assets/icons/lemonade.webp" width="16" height="16" style="vertical-align:middle;margin-right:4px;" />Лимонад: ур. ${skills.lemonade.level}</span>
          <span><img src="/assets/icons/license.webp" width="16" height="16" style="vertical-align:middle;margin-right:4px;" />Лицензии: ${licenses.courier ? 'Да' : 'Нет'} / ${licenses.trashSort ? 'Да' : 'Нет'} / ${licenses.lemonadeBusiness ? 'Да' : 'Нет'}</span>
        </div>
        <div style="padding:14px 24px;border-top:1px solid #30363d;text-align:right">
          <button id="school-close" style="background:#21262d;border:1px solid #30363d;color:#e8eaed;padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:600">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    const ext = (name: string) => name === 'courier-pro' || name === 'courier-master' || name === 'trash-expert' ? 'svg' : 'webp';
    const courses = [
      { id:'courier_basic', icon:'courier', title:'Курьер-стажёр', cost:25, desc:'Лицензия курьера. Открывает доставку $8-22/заказ', req:0, owned: licenses.courier },
      { id:'courier_pro', icon:'courier-pro', title:'Скоростная доставка', cost:65, desc:'+35% оплата, бизнес-район', req:2, owned: completed.includes('courier_pro'), skill: skills.courier.level },
      { id:'courier_master', icon:'courier-master', title:'Мастер-логист', cost:140, desc:'+130% оплата, VIP-клиенты', req:5, owned: completed.includes('courier_master'), skill: skills.courier.level },
      { id:'trash_basic', icon:'trash-sort', title:'Сортировщик', cost:15, desc:'Сертификат эко-сортировки. $5-14/смена', req:0, owned: licenses.trashSort },
      { id:'trash_expert', icon:'trash-expert', title:'Эко-инженер', cost:55, desc:'Опасные отходы +40%', req:3, owned: completed.includes('trash_expert'), skill: skills['trash-sort'].level },
      { id:'lemonade_business', icon:'lemonade', title:'Лимонадный мастер', cost:80, desc:'Образование продавца лимонада', req:0, owned: licenses.lemonadeBusiness },
    ];

    const grid = root.querySelector('#school-courses') as HTMLElement;
    courses.forEach(c => {
      const canAfford = money >= c.cost;
      const meetsReq = (c.skill ?? 0) >= (c.req ?? 0);
      const disabled = c.owned || !canAfford || !meetsReq;
      const card = document.createElement('div');
      card.style.cssText = `background:#0d1117;border:1px solid #2b313a;border-radius:12px;padding:14px;`;
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <img src="/assets/icons/${c.icon}.${ext(c.icon)}" width="22" height="22" alt="" />
          <div style="font-weight:700">${c.title}</div>
        </div>
        <div style="font-size:13px;color:#aab0bb;margin-bottom:8px;min-height:34px">${c.desc}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:800;color:${canAfford?'#ffd700':'#ff6b6b'}">$${c.cost}</span>
          <button ${disabled?'disabled':''} data-course="${c.id}" style="background:${c.owned?'#263445':canAfford?'#238636':'#3a2a2a'};color:#fff;border:none;padding:7px 12px;border-radius:8px;cursor:${disabled?'not-allowed':'pointer'};font-weight:600;font-size:13px">
            ${c.owned?'Куплено':!meetsReq?`Нужно ур.${c.req}`:!canAfford?'Нет денег':'Купить'}
          </button>
        </div>`;
      grid.appendChild(card);
    });

    grid.querySelectorAll('button[data-course]').forEach(btn => {
      btn.addEventListener('click', () => { const id = (btn as HTMLElement).dataset.course!; onBuy(id); });
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
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <img src="/assets/icons/trash-sort.webp" width="24" height="24" alt="" />
              <b>Сортировка мусора</b>
            </div>
            <div style="font-size:12px;color:#9aa3b2">Перетащи предметы в правильные контейнеры.</div>
          </div>
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

    items.forEach((it, idx) => {
      const d = document.createElement('div');
      d.draggable = true;
      d.dataset.fraction = it.fraction;
      d.dataset.idx = String(idx);
      d.style.cssText = 'background:#1b2333;border:1px solid #334055;padding:10px 12px;border-radius:10px;cursor:grab;user-select:none;display:flex;align-items:center;gap:8px;font-size:14px';
      d.innerHTML = `<img src="/assets/props/flat/trash/${it.icon}.svg" width="24" height="24" alt="" style="object-fit:contain;" /><span>${it.name}</span>`;
      d.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', it.fraction + '|' + idx); });
      itemsEl.appendChild(d);
    });

    TRASH_FRACTIONS.forEach(fr => {
      const bin = document.createElement('div');
      bin.dataset.fraction = fr.id;
      bin.style.cssText = `border:2px dashed ${fr.color};border-radius:12px;padding:14px;min-height:90px;background:#0d121c;text-align:center;transition:.15s`;
      bin.innerHTML = `<div style="font-size:28px;margin-bottom:4px;"><img src="/assets/icons/trash/${fr.icon}.svg" width="32" height="32" alt="" /></div><div style="font-weight:700;color:${fr.color}">${fr.name}</div><div class="bin-count" style="font-size:12px;color:#8190a8;margin-top:4px">0 шт</div>`;
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
        el.style.opacity='0.35'; el.style.pointerEvents='none';
        const countEl = bin.querySelector('.bin-count') as HTMLElement;
        countEl.textContent = (parseInt(countEl.textContent||'0')+1) + ' шт';
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

    const timer = setInterval(()=> { timeLeft--; timerEl.textContent = String(timeLeft); timerEl.style.color = timeLeft<8 ? '#ff6b6b' : '#7cfc00'; if (timeLeft<=0) finish(); },1000);

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

  showCourier(onFinish: JobStartCallback, _onClose: () => void): void {
    onFinish(85);
    this.destroy();
  }

  // --- LEMONADE RHYTHM ---
  showLemonade(onFinish: JobStartCallback, onClose: () => void): void {
    this.destroy();
    const root=document.createElement('div');
    root.style.cssText=`position:fixed;inset:0;background:rgba(5,7,10,.92);z-index:5000;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif`;
    root.innerHTML=`<div style="background:#131a24;border:1px solid #2b3445;border-radius:18px;width:min(620px,94vw);color:#e8eaed;overflow:hidden;text-align:center">
      <div style="padding:16px 20px;border-bottom:1px solid #2b3445;display:flex;align-items:center;justify-content:center;gap:8px;">
        <img src="/assets/icons/lemonade.webp" width="24" height="24" alt="" />
        <b>Лимонад-ритм</b>
      </div>
      <div style="padding:22px">
        <div style="font-size:13px;color:#9aa6b8;margin-bottom:14px;">Жми SPACE / клик когда ползунок в зелёной зоне</div>
        <div style="position:relative;height:56px;background:#0b1019;border-radius:12px;border:1px solid #2d3a50;overflow:hidden;margin-bottom:14px">
          <div id="lemon-hit" style="position:absolute;left:42%;width:16%;top:0;bottom:0;background:rgba(34,197,94,.28);border-left:2px solid #22c55e;border-right:2px solid #22c55e"></div>
          <div id="lemon-cursor" style="position:absolute;left:0;top:0;bottom:0;width:4px;background:#ffd700;box-shadow:0 0 10px #ffd700"></div>
        </div>
        <div style="font-size:13px;color:#a8b3c6;margin-bottom:10px">Удар <span id="lemon-beat">0</span> / 12 - Попаданий: <span id="lemon-hits" style="color:#7cfc00">0</span></div>
        <button id="lemon-tap" style="background:linear-gradient(145deg,#facc15,#f59e0b);color:#1a1200;border:none;padding:16px 28px;border-radius:14px;font-weight:800;font-size:18px;cursor:pointer;width:100%">TAP / SPACE</button>
        <div style="font-size:11px;color:#7f8ca3;margin-top:10px">Рецепт: Классический - идеально = чаевые x1.5</div>
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
    finishTimer = setTimeout(()=>{ if(running) finish(); },38000);
  }
}
