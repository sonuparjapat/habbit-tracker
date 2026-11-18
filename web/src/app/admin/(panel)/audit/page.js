'use client';

import { useState } from 'react';
import { Badge, DataTable, ErrorBox, PageHeader, Pagination } from '@/components/admin/kit';
import { fmtDateTime } from '@/lib/format';
import { useResource } from '@/lib/useApi';

const describe = (meta) =>
  Object.entries(meta ?? {})
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? JSON.stringify(v) : v}`)
    .join(' · ');

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource(`/admin/audit-logs?page=${page}`);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHeader title="Audit log" subtitle="Every action taken by an admin, newest first." />
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading}
        rows={data?.logs}
        columns={[
          { key: 'createdAt', title: 'When', render: (l) => <span className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</span> },
          { key: 'actorEmail', title: 'Admin', render: (l) => l.actorEmail ?? '—' },
          { key: 'action', title: 'Action', render: (l) => <Badge tone="info">{l.action}</Badge> },
          { key: 'meta', title: 'Details', render: (l) => <span className="small muted mono">{describe(l.meta)}</span> },
        ]}
      />
      <Pagination page={page} hasNext={data?.logs?.length === 50} onPage={setPage} />
    </div>
  );
}
