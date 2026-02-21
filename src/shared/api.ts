export const ApiEndpoint = {
  ScanEmojiPatterns: "/internal/menu/scan-emoji-patterns",
} as const;

export type ApiEndpoint = (typeof ApiEndpoint)[keyof typeof ApiEndpoint];
