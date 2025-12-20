import { EMAIL_FROM, RESEND_API_KEY } from "../config";

export interface SupportReplyResult {
  sent: boolean;
}

export async function sendSupportReplyEmail(
  to: string,
  subject: string,
  message: string
): Promise<SupportReplyResult> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping support reply email");
    return { sent: false };
  }

  const fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
  if (!fetchFn) {
    console.error("Fetch API not available in this runtime; cannot send support reply email");
    return { sent: false };
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
        to,
        subject,
        text: message,
        html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Failed to send support reply email", response.status, body);
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error("Error sending support reply email", error);
    return { sent: false };
  }
}
