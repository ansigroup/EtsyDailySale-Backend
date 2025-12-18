import { APP_BASE_URL, EMAIL_FROM, RESEND_API_KEY } from "../config";

export interface MagicLinkResult {
  sent: boolean;
  loginUrl: string;
}

function buildLoginUrl(email: string, code: string) {
  const encodedEmail = encodeURIComponent(email.toLowerCase());
  const encodedCode = encodeURIComponent(code);
  return `${APP_BASE_URL}/magic-login?email=${encodedEmail}&code=${encodedCode}`;
}

export async function sendMagicLinkEmail(email: string, code: string): Promise<MagicLinkResult> {
  const loginUrl = buildLoginUrl(email, code);

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping email send");
    return { sent: false, loginUrl };
  }

  const fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
  if (!fetchFn) {
    console.error("Fetch API not available in this runtime; cannot send email");
    return { sent: false, loginUrl };
  }

  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: email,
        subject: "Your DailySale login link",
        text: `Click the link below to log in:\n${loginUrl}\n\nOr enter this one-time code: ${code}`,
        html: `<p>Click the button below to log into your DailySale account.</p><p><a href="${loginUrl}" style="display:inline-block;padding:10px 16px;background:#222;color:#fff;text-decoration:none;border-radius:6px">Log me in</a></p><p>If the button does not work, copy and paste this link into your browser:<br><a href="${loginUrl}">${loginUrl}</a></p><p>Or enter this one-time code: <strong>${code}</strong></p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Failed to send magic link email", response.status, body);
      return { sent: false, loginUrl };
    }

    return { sent: true, loginUrl };
  } catch (error) {
    console.error("Error sending magic link email", error);
    return { sent: false, loginUrl };
  }
}

