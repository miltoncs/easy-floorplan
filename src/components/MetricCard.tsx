export function MetricCard({
  label,
  value,
  subdued,
}: {
  label: string
  value: string
  subdued?: boolean
}) {
  return (
    <article className={subdued ? 'metric-card subdued' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
