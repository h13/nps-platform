import type { Env } from '../types';

export interface SendMailParams {
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}

export interface SendMailResult {
  ok: boolean;
  error?: string;
}

export async function sendMail(env: Env, params: SendMailParams): Promise<SendMailResult> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: params.to, name: params.toName }],
        },
      ],
      from: {
        email: env.SENDGRID_FROM_ADDRESS,
        name: env.SENDGRID_FROM_NAME,
      },
      subject: params.subject,
      content: [
        {
          type: 'text/html',
          value: params.htmlBody,
        },
      ],
    }),
  });

  if (response.status === 202) {
    return { ok: true };
  }

  const errorText = await response.text();
  return { ok: false, error: `SendGrid ${response.status}: ${errorText}` };
}
