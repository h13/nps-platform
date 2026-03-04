export interface SurveyConfig {
  survey_title: string;
  thanks_message: string;
  widget_primary_color: string;
  widget_bg_color: string;
  widget_text_color: string;
  questions: Question[];
}

interface Question {
  id: string;
  type: string;
  text: string;
  required: boolean;
  display_order: number;
  placeholder?: string;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  min_label?: string;
  max_label?: string;
  options?: { value: string; label: string }[];
}

export interface PopupCallbacks {
  onSubmit: (answers: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

const STYLE = `
:host { all: initial; }
* { margin: 0; padding: 0; box-sizing: border-box; }
.overlay {
  position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
  width: 380px; max-width: calc(100vw - 32px); max-height: calc(100vh - 40px);
  background: var(--bg); color: var(--text); border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  overflow-y: auto; animation: slideUp 0.3s ease;
}
@keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeOut { from { opacity:1; } to { opacity:0; } }
.header { display:flex; justify-content:space-between; align-items:center; padding:20px 20px 0; }
.header h2 { font-size:1.1rem; font-weight:700; }
.close-btn { background:none; border:none; font-size:1.4rem; cursor:pointer; color:var(--text); opacity:0.5; line-height:1; padding:4px; }
.close-btn:hover { opacity:1; }
.body { padding:16px 20px 20px; }
.question { margin-top:16px; }
.question:first-child { margin-top:0; }
.q-text { font-weight:600; font-size:0.9rem; margin-bottom:8px; }
.required-mark { color:#dc2626; margin-left:2px; }
.btn-row { display:flex; gap:3px; flex-wrap:nowrap; justify-content:center; }
.score-btn { min-width:0; flex:1 1 0; height:30px; border:2px solid #d1d5db; border-radius:6px; background:#fff; cursor:pointer; font-size:0.8rem; font-weight:600; transition:all 0.15s; color:#374151; padding:0; }
.score-btn.selected { color:#fff !important; }
.score-btn.nps-low { border-color:#fca5a5; }
.score-btn.nps-low.selected { background:#ef4444; border-color:#ef4444; }
.score-btn.nps-mid { border-color:#fcd34d; }
.score-btn.nps-mid.selected { background:#f59e0b; border-color:#f59e0b; }
.score-btn.nps-high { border-color:#86efac; }
.score-btn.nps-high.selected { background:#22c55e; border-color:#22c55e; }
.score-btn.rating-btn.selected { background:var(--primary); border-color:var(--primary); }
.labels { display:flex; justify-content:space-between; font-size:0.7rem; color:#9ca3af; margin-top:4px; }
textarea { width:100%; padding:8px 10px; border:2px solid #d1d5db; border-radius:6px; font-size:0.85rem; resize:vertical; min-height:60px; font-family:inherit; color:var(--text); }
textarea:focus { outline:none; border-color:var(--primary); }
select { width:100%; padding:8px 10px; border:2px solid #d1d5db; border-radius:6px; font-size:0.85rem; background:#fff; color:var(--text); }
select:focus { outline:none; border-color:var(--primary); }
.opt-group { display:flex; flex-direction:column; gap:6px; }
.opt-group label { display:flex; align-items:center; gap:6px; padding:6px 10px; border:2px solid #d1d5db; border-radius:6px; cursor:pointer; font-size:0.85rem; transition:border-color 0.15s; }
.opt-group label:hover { border-color:var(--primary); }
.opt-group input:checked + span { font-weight:600; }
.submit-btn { display:block; width:100%; padding:12px; margin-top:20px; border:none; border-radius:8px; background:var(--primary); color:#fff; font-size:0.95rem; font-weight:600; cursor:pointer; transition:opacity 0.15s; }
.submit-btn:hover { opacity:0.9; }
.submit-btn:disabled { opacity:0.5; cursor:not-allowed; }
.error-msg { color:#dc2626; font-size:0.75rem; margin-top:3px; display:none; }
.error-msg.visible { display:block; }
.thanks { text-align:center; padding:40px 20px; }
.thanks .check { font-size:2.5rem; margin-bottom:12px; color:#22c55e; }
.thanks p { font-size:1rem; font-weight:600; }
`;

export function showPopup(config: SurveyConfig, callbacks: PopupCallbacks): HTMLElement {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);

  host.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;';

  const primary = config.widget_primary_color || '#2563EB';
  const bg = config.widget_bg_color || '#FFFFFF';
  const text = config.widget_text_color || '#1F2937';

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.style.setProperty('--primary', primary);
  overlay.style.setProperty('--bg', bg);
  overlay.style.setProperty('--text', text);

  const answers: Record<string, unknown> = {};

  // Header
  const header = document.createElement('div');
  header.className = 'header';
  const title = document.createElement('h2');
  title.textContent = config.survey_title || '';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', () => callbacks.onClose());
  header.appendChild(title);
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'body';

  const form = document.createElement('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;

    for (const q of config.questions) {
      const errEl = shadow.getElementById(`err-${q.id}`);
      if (errEl) errEl.classList.remove('visible');
      if (q.required) {
        const val = answers[q.id];
        if (
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0)
        ) {
          if (errEl) {
            errEl.textContent = '\u3053\u306e\u9805\u76ee\u306f\u5fc5\u9808\u3067\u3059';
            errEl.classList.add('visible');
          }
          valid = false;
        }
      }
    }

    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '\u9001\u4fe1\u4e2d...';

    callbacks
      .onSubmit(answers)
      .then(() => {
        overlay.innerHTML = '';
        const thanks = document.createElement('div');
        thanks.className = 'thanks';
        thanks.innerHTML = '<div class="check">\u2713</div>';
        const msg = document.createElement('p');
        msg.textContent = config.thanks_message || '';
        thanks.appendChild(msg);
        overlay.appendChild(thanks);

        setTimeout(() => {
          overlay.style.animation = 'fadeOut 0.3s ease forwards';
          setTimeout(() => callbacks.onClose(), 300);
        }, 2000);
      })
      .catch(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = '\u9001\u4fe1\u3059\u308b';
      });
  });

  for (const q of config.questions) {
    const div = document.createElement('div');
    div.className = 'question';

    const qText = document.createElement('div');
    qText.className = 'q-text';
    qText.textContent = q.text;
    if (q.required) {
      const mark = document.createElement('span');
      mark.className = 'required-mark';
      mark.textContent = '*';
      qText.appendChild(mark);
    }
    div.appendChild(qText);

    switch (q.type) {
      case 'nps_score':
        div.appendChild(buildNpsButtons(q, answers));
        break;
      case 'rating':
        div.appendChild(buildRatingButtons(q, answers));
        break;
      case 'free_text':
        div.appendChild(buildTextarea(q, answers));
        break;
      case 'single_select':
        div.appendChild(buildSelect(q, answers));
        break;
      case 'multi_select':
        div.appendChild(buildCheckboxes(q, answers));
        break;
      case 'radio':
        div.appendChild(buildRadios(q, answers));
        break;
    }

    const errMsg = document.createElement('div');
    errMsg.className = 'error-msg';
    errMsg.id = `err-${q.id}`;
    div.appendChild(errMsg);

    form.appendChild(div);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'submit-btn';
  submitBtn.textContent = '\u9001\u4fe1\u3059\u308b';
  form.appendChild(submitBtn);

  body.appendChild(form);
  overlay.appendChild(body);
  shadow.appendChild(overlay);
  document.body.appendChild(host);

  return host;
}

function npsColorClass(val: number): string {
  if (val <= 6) return 'nps-low';
  if (val <= 8) return 'nps-mid';
  return 'nps-high';
}

function buildNpsButtons(q: Question, answers: Record<string, unknown>): HTMLElement {
  const wrapper = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'btn-row';

  for (let i = 0; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `score-btn ${npsColorClass(i)}`;
    btn.textContent = String(i);
    btn.addEventListener('click', () => {
      row.querySelectorAll('.score-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      answers[q.id] = i;
    });
    row.appendChild(btn);
  }

  wrapper.appendChild(row);
  appendLabels(wrapper, q.min_label, q.max_label);
  return wrapper;
}

function buildRatingButtons(q: Question, answers: Record<string, unknown>): HTMLElement {
  const wrapper = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'btn-row';
  const min = q.min_value ?? 1;
  const max = q.max_value ?? 5;

  for (let i = min; i <= max; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'score-btn rating-btn';
    btn.textContent = String(i);
    btn.addEventListener('click', () => {
      row.querySelectorAll('.score-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      answers[q.id] = i;
    });
    row.appendChild(btn);
  }

  wrapper.appendChild(row);
  appendLabels(wrapper, q.min_label, q.max_label);
  return wrapper;
}

function buildTextarea(q: Question, answers: Record<string, unknown>): HTMLElement {
  const ta = document.createElement('textarea');
  if (q.placeholder) ta.placeholder = q.placeholder;
  if (q.max_length) ta.maxLength = q.max_length;
  ta.addEventListener('input', () => {
    answers[q.id] = ta.value;
  });
  return ta;
}

function buildSelect(q: Question, answers: Record<string, unknown>): HTMLElement {
  const sel = document.createElement('select');
  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = '\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044';
  sel.appendChild(defOpt);
  for (const o of q.options ?? []) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    answers[q.id] = sel.value || undefined;
  });
  return sel;
}

function buildCheckboxes(q: Question, answers: Record<string, unknown>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'opt-group';
  for (const o of q.options ?? []) {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = o.value;
    cb.addEventListener('change', () => {
      const checked = group.querySelectorAll<HTMLInputElement>('input:checked');
      const vals: string[] = [];
      checked.forEach((c) => vals.push(c.value));
      answers[q.id] = vals.length > 0 ? vals : undefined;
    });
    const span = document.createElement('span');
    span.textContent = o.label;
    lbl.appendChild(cb);
    lbl.appendChild(span);
    group.appendChild(lbl);
  }
  return group;
}

function buildRadios(q: Question, answers: Record<string, unknown>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'opt-group';
  for (const o of q.options ?? []) {
    const lbl = document.createElement('label');
    const rb = document.createElement('input');
    rb.type = 'radio';
    rb.name = q.id;
    rb.value = o.value;
    rb.addEventListener('change', () => {
      answers[q.id] = rb.value;
    });
    const span = document.createElement('span');
    span.textContent = o.label;
    lbl.appendChild(rb);
    lbl.appendChild(span);
    group.appendChild(lbl);
  }
  return group;
}

function appendLabels(wrapper: HTMLElement, minLabel?: string, maxLabel?: string): void {
  if (!minLabel && !maxLabel) return;
  const labels = document.createElement('div');
  labels.className = 'labels';
  const left = document.createElement('span');
  left.textContent = minLabel || '';
  const right = document.createElement('span');
  right.textContent = maxLabel || '';
  labels.appendChild(left);
  labels.appendChild(right);
  wrapper.appendChild(labels);
}
