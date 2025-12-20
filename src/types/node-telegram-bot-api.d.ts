declare namespace TelegramBot {
  type ConstructorOptions = {
    polling?: boolean;
  };

  interface Chat {
    id: number | string;
  }

  interface Message {
    message_id: number;
    text?: string;
    caption?: string;
    chat: Chat;
    reply_to_message?: Message;
    [key: string]: any;
  }

  interface SendMessageOptions {
    parse_mode?: string;
  }
}

declare class TelegramBot {
  constructor(token: string, options?: TelegramBot.ConstructorOptions);
  on(event: "message", listener: (message: TelegramBot.Message) => void): TelegramBot;
  sendMessage(
    chatId: string | number,
    text: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<any>;
}

export = TelegramBot;
