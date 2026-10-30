import type { ExperimentDetail, ResultsView } from "@/api/experiments";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { extremeText, meanText } from "@/lib/results";

// Count, min, max, and mean per variable, from the API's SQL aggregates; each
// extreme names its trials (spec 0009, AC-5).
function VariableSummary({
  variables,
  results,
}: {
  readonly variables: ExperimentDetail["variables"];
  readonly results: ResultsView;
}) {
  const byId = new Map(results.variables.map((v) => [v.variable_id, v]));
  const rows = variables.map((variable) => {
    const summary = byId.get(variable.id);
    const stats =
      summary &&
      summary.count > 0 &&
      summary.min !== null &&
      summary.max !== null &&
      summary.mean !== null
        ? {
            min: extremeText(summary.min, variable.unit, summary.min_trials),
            max: extremeText(summary.max, variable.unit, summary.max_trials),
            mean: meanText(summary.mean, variable.unit),
          }
        : null;
    return { variable, count: summary?.count ?? 0, stats };
  });
  return (
    <>
      <div className="overflow-x-auto max-lg:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variable</TableHead>
              <TableHead className="text-right">Valores</TableHead>
              <TableHead className="text-right">Mínimo</TableHead>
              <TableHead className="text-right">Máximo</TableHead>
              <TableHead className="text-right">Promedio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ variable, count, stats }) => (
              <TableRow key={variable.id}>
                <TableCell className="font-medium text-ink">
                  {variable.name}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(count)}
                </TableCell>
                {stats === null ? (
                  <TableCell colSpan={3} className="text-right text-ink-muted">
                    Sin valores
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right font-mono tabular-nums">
                      {stats.min}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {stats.max}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {stats.mean}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {/* The phone reads one card per variable instead of five columns
          (spec 0010, AC-6). */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map(({ variable, count, stats }) => (
          <li
            key={variable.id}
            className="rounded-control border border-line px-4 py-3"
          >
            <p className="font-medium text-ink">{variable.name}</p>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-muted">Valores</dt>
              <dd className="text-right font-mono tabular-nums">
                {formatNumber(count)}
              </dd>
              {stats === null ? (
                <>
                  <dt className="sr-only">Resumen</dt>
                  <dd className="col-span-2 text-ink-muted">Sin valores</dd>
                </>
              ) : (
                <>
                  <dt className="text-ink-muted">Mínimo</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {stats.min}
                  </dd>
                  <dt className="text-ink-muted">Máximo</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {stats.max}
                  </dd>
                  <dt className="text-ink-muted">Promedio</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {stats.mean}
                  </dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export { VariableSummary };
