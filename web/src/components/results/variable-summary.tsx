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
  return (
    <div className="overflow-x-auto">
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
          {variables.map((variable) => {
            const summary = byId.get(variable.id);
            const stats =
              summary &&
              summary.count > 0 &&
              summary.min !== null &&
              summary.max !== null &&
              summary.mean !== null
                ? {
                    min: summary.min,
                    max: summary.max,
                    mean: summary.mean,
                    minTrials: summary.min_trials,
                    maxTrials: summary.max_trials,
                  }
                : null;
            return (
              <TableRow key={variable.id}>
                <TableCell className="font-medium text-ink">
                  {variable.name}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(summary?.count ?? 0)}
                </TableCell>
                {stats === null ? (
                  <TableCell colSpan={3} className="text-right text-ink-muted">
                    Sin valores
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right font-mono tabular-nums">
                      {extremeText(stats.min, variable.unit, stats.minTrials)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {extremeText(stats.max, variable.unit, stats.maxTrials)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {meanText(stats.mean, variable.unit)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export { VariableSummary };
