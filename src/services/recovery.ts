import { requestJson } from './httpClient';

export type CodeRecoveryRecord = {
  recoveryId: string;
  sessionId: string;
  generatedAt: string;
  branch: string;
  status: 'recoverable' | 'clean';
  bytes: number;
  sha256: string;
};

export type CodeRecoveryListResponse = {
  recoveries: CodeRecoveryRecord[];
};

export type CodeRecoveryTicketResponse = {
  url: string;
  expiresAt: string;
};

export async function loadCodeRecoveries(): Promise<CodeRecoveryRecord[]> {
  const response = await requestJson<CodeRecoveryListResponse>('code/recoveries', { auth: 'required', cache: 'no-store' });
  return Array.isArray(response.recoveries) ? response.recoveries : [];
}

export function createCodeRecoveryTicket(recoveryId: string): Promise<CodeRecoveryTicketResponse> {
  return requestJson<CodeRecoveryTicketResponse>(`code/recoveries/${encodeURIComponent(recoveryId)}/ticket`, {
    method: 'POST', auth: 'required', cache: 'no-store', body: {},
  });
}
