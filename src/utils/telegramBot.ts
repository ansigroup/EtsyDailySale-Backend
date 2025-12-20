import TelegramBot from "node-telegram-bot-api";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "../config";
import { SupportRequest } from "../models/support";
import { sendSupportReplyEmail } from "./supportEmail";

let bot: TelegramBot | undefined;
let botInitialized = false;

function extractTicketId(text?: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/Ticket ID:\s*([a-fA-F0-9]{24})/);
  return match?.[1];
}

function isFromConfiguredChat(message: TelegramBot.Message): boolean {
  if (!TELEGRAM_CHAT_ID) return true;
  const chatId = message?.chat?.id;
  return chatId !== undefined && chatId !== null && chatId.toString() === TELEGRAM_CHAT_ID.toString();
}

function ensureBot(): TelegramBot | undefined {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("Telegram bot token missing; skipping bot initialization");
    return undefined;
  }

  if (!bot) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  }

  if (!botInitialized) {
    bot.on("message", handleSupportReplyMessage);
    botInitialized = true;
  }

  return bot;
}

async function handleSupportReplyMessage(message: TelegramBot.Message) {
  try {
    if (!isFromConfiguredChat(message)) return;

    const replyTo = message.reply_to_message;
    const replyText: string | undefined = message.text || message.caption;
    const originalText: string | undefined = replyTo?.text || replyTo?.caption;

    if (!replyTo || !replyText || !originalText) return;

    const ticketId = extractTicketId(originalText);
    if (!ticketId) return;

    const supportRequest = await SupportRequest.findById(ticketId).exec();
    if (!supportRequest) {
      await sendTelegramNotification(
        [
          "⚠️ Could not find support ticket for reply",
          `Ticket ID: ${ticketId}`,
        ].join("\n")
      );
      return;
    }

    const emailSubject = `Re: ${supportRequest.subject} Support Ticket #[${ticketId}] `;

      const replyMessage = `Hello,

Thanks for reaching out.

> ${supportRequest.message}

Response:
${replyText}

Best regards,
DailySale.app`;

    console.log("replyMessage:", {em: supportRequest.email, emailSubject,  replyMessage})
    const { sent } = await sendSupportReplyEmail(
      supportRequest.email,
      emailSubject,
        replyMessage
    );

    await sendTelegramNotification(
      [
        sent ? "✅ Sent support reply" : "⚠️ Failed to send support reply",
        `Ticket ID: ${supportRequest.id}`,
        `To: ${supportRequest.email}`,
      ].join("\n")
    );
  } catch (error) {
    console.error("Error handling Telegram support reply", error);
  }
}

export function initializeTelegramBot() {
  ensureBot();
}

export async function sendTelegramNotification(message: string) {
  const telegramBot = ensureBot();

  if (!telegramBot || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram bot configuration missing; skipping notification");
    return;
  }

  try {
    await telegramBot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error sending Telegram notification", error);
  }
}
