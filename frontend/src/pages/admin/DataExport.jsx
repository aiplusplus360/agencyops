import { PageHeader } from '../../components/ui';

function downloadCsv(path, filename) {
  const token = localStorage.getItem('tm_access');
  return fetch(path, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
}

export default function DataExport() {
  return (
    <div>
      <PageHeader title="Data Export" subtitle="Full JSON backup + CSV reports" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900">Full system backup</h2>
          <p className="mt-1 text-sm text-slate-500">
            Exports users, workers, skills, products, visions, roadmaps, tasks, assignments, submissions, evaluations,
            AI decisions, templates, and digests as a single JSON file. This is the complete audit record.
          </p>
          <button
            className="btn-primary mt-4"
            onClick={() => downloadCsv('/api/export/full', `task-manager-backup-${Date.now()}.json`)}
          >
            Download JSON backup
          </button>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900">Tasks report (CSV)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every task with status, deadline, assigned worker, compatibility score, and latest AI quality score.
          </p>
          <button
            className="btn-secondary mt-4"
            onClick={() => downloadCsv('/api/export/tasks.csv', `tasks-${Date.now()}.csv`)}
          >
            Download tasks CSV
          </button>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900">Workers report (CSV)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every worker with skills, seniority, capacity, availability, average quality, on-time rate, and completed count.
          </p>
          <button
            className="btn-secondary mt-4"
            onClick={() => downloadCsv('/api/export/workers.csv', `workers-${Date.now()}.csv`)}
          >
            Download workers CSV
          </button>
        </div>
      </div>
    </div>
  );
}
