interface EmailParams {
  contactName: string;
  surveyTitle: string;
  formUrl: string;
  expiresAt: string;
  primaryColor: string;
}

export function renderEmailSubject(
  template: string,
  vars: { account_name: string; survey_title: string; contact_name: string },
): string {
  return template
    .replace('{account_name}', vars.account_name)
    .replace('{survey_title}', vars.survey_title)
    .replace('{contact_name}', vars.contact_name);
}

export function renderEmailHtml(params: EmailParams): string {
  const expiryDate = new Date(params.expiresAt);
  const formattedExpiry = `${expiryDate.getFullYear()}/${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${String(expiryDate.getDate()).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:40px 32px;">
            <h1 style="margin:0 0 24px;font-size:20px;color:#1F2937;text-align:center;">${escapeHtml(params.surveyTitle)}</h1>
            <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.7;">${escapeHtml(params.contactName)} 様</p>
            <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.7;">いつもご利用いただきありがとうございます。</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">サービス改善のため、簡単なアンケートへのご協力をお願いいたします。</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 24px;">
                  <a href="${escapeHtml(params.formUrl)}" target="_blank" style="display:inline-block;padding:14px 40px;background:${escapeHtml(params.primaryColor)};color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">アンケートに回答する</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;">回答期限: ${formattedExpiry}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;line-height:1.6;">
              このメールは ${escapeHtml(params.surveyTitle)} に関する自動送信メールです。<br>
              今後このようなメールの受信を希望されない場合は、担当者までご連絡ください。
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
