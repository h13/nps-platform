export function renderAlreadyRespondedHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>回答済み</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1F2937; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #fff; border-radius: 12px; padding: 48px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; max-width: 480px; }
  .icon { font-size: 3rem; margin-bottom: 16px; }
  h1 { font-size: 1.3rem; margin-bottom: 12px; }
  p { color: #6b7280; line-height: 1.6; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">&#10003;</div>
  <h1>既にご回答いただいています</h1>
  <p>このアンケートは既に回答済みです。<br>ご協力ありがとうございました。</p>
</div>
</body>
</html>`;
}
