export function Flag({ code, title }: { code: string; title?: string }) {
  if (!code) return null;
  return (
    <img
      className="flag"
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      title={title}
      loading="lazy"
      onError={(e) => (e.currentTarget.style.visibility = "hidden")}
    />
  );
}

const STATUS_TEXT = { official: "Final ranking", live: "In progress", empty: "Not started" } as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_TEXT }) {
  return <span className={`badge ${status}`}>{STATUS_TEXT[status]}</span>;
}
