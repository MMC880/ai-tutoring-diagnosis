export {};
declare global {
  interface Window {
    jinxueDesktop?: {
      openAgent(context: { subject: string; studentId?: string | null }): Promise<{ opened: boolean }>;
      getAgentContext(): Promise<{ subject: string; studentId: string | null }>;
    };
  }
}
