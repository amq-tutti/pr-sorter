type ProgressProps = {
  label: string;
  percentage: number;
};

export function Progress({ label, percentage }: ProgressProps) {
  return (
    <div className="progress">
      <span className="progressbattle">{label}</span>
      <div className="progress-container">
        <div className="progress-bar" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
