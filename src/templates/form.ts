export function renderFormHtml(configJson: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>アンケート</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: var(--text-color, #1F2937); line-height: 1.6; }
  .container { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
  .card { background: var(--bg-color, #fff); border-radius: 12px; padding: 32px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  h1 { font-size: 1.5rem; margin-bottom: 8px; text-align: center; }
  .question { margin-top: 28px; }
  .question-text { font-weight: 600; margin-bottom: 10px; font-size: 0.95rem; }
  .required-mark { color: #dc2626; margin-left: 4px; }
  /* NPS / Rating buttons */
  .btn-row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
  .btn-row button { min-width: 40px; height: 40px; border: 2px solid #d1d5db; border-radius: 8px; background: #fff; cursor: pointer; font-size: 0.95rem; font-weight: 600; transition: all 0.15s; }
  .btn-row button.selected { border-color: var(--primary-color, #2563EB); background: var(--primary-color, #2563EB); color: #fff; }
  .btn-row button:hover:not(.selected) { border-color: var(--primary-color, #2563EB); }
  .labels { display: flex; justify-content: space-between; font-size: 0.75rem; color: #6b7280; margin-top: 6px; }
  /* Textarea */
  textarea { width: 100%; padding: 10px 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; resize: vertical; min-height: 80px; font-family: inherit; }
  textarea:focus { outline: none; border-color: var(--primary-color, #2563EB); }
  /* Select */
  select { width: 100%; padding: 10px 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; background: #fff; }
  select:focus { outline: none; border-color: var(--primary-color, #2563EB); }
  /* Checkbox / Radio */
  .option-group { display: flex; flex-direction: column; gap: 8px; }
  .option-group label { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 2px solid #d1d5db; border-radius: 8px; cursor: pointer; font-size: 0.95rem; transition: border-color 0.15s; }
  .option-group label:hover { border-color: var(--primary-color, #2563EB); }
  .option-group input:checked + span { font-weight: 600; }
  .option-group label:has(input:checked) { border-color: var(--primary-color, #2563EB); background: color-mix(in srgb, var(--primary-color, #2563EB) 8%, transparent); }
  /* Submit */
  .submit-btn { display: block; width: 100%; padding: 14px; margin-top: 32px; border: none; border-radius: 8px; background: var(--primary-color, #2563EB); color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
  .submit-btn:hover { opacity: 0.9; }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  /* Error */
  .error-msg { color: #dc2626; font-size: 0.8rem; margin-top: 4px; display: none; }
  .error-msg.visible { display: block; }
  /* Thanks */
  .thanks { text-align: center; padding: 48px 24px; }
  .thanks h2 { font-size: 1.3rem; margin-bottom: 8px; }
  .check-icon { font-size: 3rem; margin-bottom: 16px; }
</style>
</head>
<body>
<div class="container">
  <div class="card" id="form-card">
    <h1 id="survey-title"></h1>
    <form id="nps-form"></form>
  </div>
  <div class="card thanks" id="thanks-card" style="display:none">
    <div class="check-icon">&#10003;</div>
    <h2 id="thanks-message"></h2>
  </div>
</div>
<script>
(function() {
  var CONFIG = ${configJson};
  var TOKEN = ${JSON.stringify(token)};

  document.documentElement.style.setProperty('--primary-color', CONFIG.widget_primary_color || '#2563EB');
  document.documentElement.style.setProperty('--bg-color', CONFIG.widget_bg_color || '#FFFFFF');
  document.documentElement.style.setProperty('--text-color', CONFIG.widget_text_color || '#1F2937');

  document.getElementById('survey-title').textContent = CONFIG.survey_title || '';
  document.getElementById('thanks-message').textContent = CONFIG.thanks_message || '';

  var form = document.getElementById('nps-form');
  var answers = {};

  CONFIG.questions.forEach(function(q) {
    var div = document.createElement('div');
    div.className = 'question';
    div.setAttribute('data-qid', q.id);

    var label = document.createElement('div');
    label.className = 'question-text';
    label.textContent = q.text;
    if (q.required) {
      var mark = document.createElement('span');
      mark.className = 'required-mark';
      mark.textContent = '*';
      label.appendChild(mark);
    }
    div.appendChild(label);

    switch (q.type) {
      case 'nps_score':
        div.appendChild(buildButtonRow(q, 0, 10));
        break;
      case 'rating':
        div.appendChild(buildButtonRow(q, q.min_value || 1, q.max_value || 5));
        break;
      case 'free_text':
        var ta = document.createElement('textarea');
        ta.placeholder = q.placeholder || '';
        if (q.max_length) ta.maxLength = q.max_length;
        ta.addEventListener('input', function() { answers[q.id] = ta.value; });
        div.appendChild(ta);
        break;
      case 'single_select':
        var sel = document.createElement('select');
        var defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = '選択してください';
        sel.appendChild(defOpt);
        (q.options || []).forEach(function(o) {
          var opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function() { answers[q.id] = sel.value || undefined; });
        div.appendChild(sel);
        break;
      case 'multi_select':
        var group = document.createElement('div');
        group.className = 'option-group';
        (q.options || []).forEach(function(o) {
          var lbl = document.createElement('label');
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = o.value;
          cb.addEventListener('change', function() {
            var checked = group.querySelectorAll('input:checked');
            var vals = [];
            checked.forEach(function(c) { vals.push(c.value); });
            answers[q.id] = vals.length > 0 ? vals : undefined;
          });
          var span = document.createElement('span');
          span.textContent = o.label;
          lbl.appendChild(cb);
          lbl.appendChild(span);
          group.appendChild(lbl);
        });
        div.appendChild(group);
        break;
      case 'radio':
        var rgroup = document.createElement('div');
        rgroup.className = 'option-group';
        (q.options || []).forEach(function(o) {
          var lbl = document.createElement('label');
          var rb = document.createElement('input');
          rb.type = 'radio';
          rb.name = q.id;
          rb.value = o.value;
          rb.addEventListener('change', function() { answers[q.id] = rb.value; });
          var span = document.createElement('span');
          span.textContent = o.label;
          lbl.appendChild(rb);
          lbl.appendChild(span);
          rgroup.appendChild(lbl);
        });
        div.appendChild(rgroup);
        break;
    }

    var errMsg = document.createElement('div');
    errMsg.className = 'error-msg';
    errMsg.id = 'err-' + q.id;
    div.appendChild(errMsg);

    form.appendChild(div);
  });

  var btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'submit-btn';
  btn.textContent = '送信する';
  form.appendChild(btn);

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var valid = true;

    CONFIG.questions.forEach(function(q) {
      var errEl = document.getElementById('err-' + q.id);
      errEl.classList.remove('visible');
      if (q.required) {
        var val = answers[q.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          errEl.textContent = 'この項目は必須です';
          errEl.classList.add('visible');
          valid = false;
        }
      }
    });

    if (!valid) return;

    btn.disabled = true;
    btn.textContent = '送信中...';

    var payload = { token: TOKEN, answers: answers };

    fetch('/nps/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) { return res.json(); })
    .then(function() {
      document.getElementById('form-card').style.display = 'none';
      document.getElementById('thanks-card').style.display = 'block';
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = '送信する';
      alert('送信に失敗しました。もう一度お試しください。');
    });
  });

  function buildButtonRow(q, min, max) {
    var wrapper = document.createElement('div');
    var row = document.createElement('div');
    row.className = 'btn-row';
    for (var i = min; i <= max; i++) {
      (function(val) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = val;
        b.addEventListener('click', function() {
          row.querySelectorAll('button').forEach(function(btn) { btn.classList.remove('selected'); });
          b.classList.add('selected');
          answers[q.id] = val;
        });
        row.appendChild(b);
      })(i);
    }
    wrapper.appendChild(row);
    if (q.min_label || q.max_label) {
      var labels = document.createElement('div');
      labels.className = 'labels';
      var left = document.createElement('span');
      left.textContent = q.min_label || '';
      var right = document.createElement('span');
      right.textContent = q.max_label || '';
      labels.appendChild(left);
      labels.appendChild(right);
      wrapper.appendChild(labels);
    }
    return wrapper;
  }
})();
</script>
</body>
</html>`;
}
