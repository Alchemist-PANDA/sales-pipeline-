// Tiny typed API client. All calls hit the Express server via the Vite proxy.

const j = async (r: Response) => {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

export const api = {
  get: (p: string) => fetch(`/api${p}`).then(j),
  post: (p: string, body?: unknown) =>
    fetch(`/api${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(j),
};

export interface Platform {
  id: string;
  name: string;
  category: string;
  authType: 'mcp_gateway' | 'api_key' | 'oauth2' | 'cookie' | 'public';
  onboarding: string;
  provides: string[];
  enrichment?: boolean;
  fields: { key: string; label: string; secret?: boolean; optional?: boolean }[];
  gateway?: { kind: string; name: string; url?: string };
  docs?: string;
  notes?: string;
  capacity: { live: number; reserved: number; total: number };
}

export interface Lead {
  id: number;
  company: string;
  domain?: string;
  contact_name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  phone?: string;
  linkedin?: string;
  industry?: string;
  employee_count?: number;
  location?: string;
  product: string;
  fit_score: number;
  status: string;
  signals: { signal_code: string; strength: number; evidence: string; source: string }[];
}

export interface Owner {
  id: number;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'reserved';
  share_pct: number;
  invite_state: string;
  connected_accounts: number;
  total_accounts: number;
}
