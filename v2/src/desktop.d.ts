export {};
declare global {
  interface Window {
    jinxueDesktop?: {
      openAgent(context: { subject: string; studentId?: string | null; assignmentId?: string | null }): Promise<{ opened: boolean }>;
      manageData(action: 'backup' | 'restore' | 'select-data'): Promise<{ notice?: string }>;
      getAgentContext(): Promise<{ subject: string; studentId: string | null; assignmentId?: string | null }>;
    };
  }
}
