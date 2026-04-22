// Przykładowy helper do aplikacji z Anthropic, dodaj to do miejsca gdzie wywołujesz API.

export function stripThinkingBlocks(messages: any[]) {
  return messages.map((message) => {
    // Jeżeli wiadomość nie jest asystenta, zwracamy bez zmian (tylko asystent uzywa "thinking")
    if (message.role !== "assistant") return message;

    // Jeśli treść wiadomości jest stringiem, nie ma bloków strukturalnych (thinking)
    if (typeof message.content === "string") return message;

    // Jeżeli wiadomość jest zdefiniowana jako tablica bloków - filtrujemy bloki "thinking"
    if (Array.isArray(message.content)) {
      const filteredContent = message.content.filter(
        (block: any) => block.type !== "thinking"
      );

      return {
        ...message,
        content: filteredContent,
      };
    }

    return message;
  });
}
