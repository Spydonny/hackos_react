type Props = {
  label: string;
  value: number;
};

export default function StatsCard({ label, value }: Props) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
