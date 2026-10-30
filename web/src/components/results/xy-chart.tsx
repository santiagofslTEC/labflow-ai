"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useSyncExternalStore } from "react";

import type { ExperimentDetail } from "@/api/experiments";
import { Skeleton } from "@/components/ui/skeleton";
import { formatQuantity } from "@/lib/format";
import {
  pointsInXOrder,
  pointText,
  variableLabel,
  type Point,
} from "@/lib/results";

type Variable = ExperimentDetail["variables"][number];

const CHART_HEIGHT = 360;

const Plot = dynamic(() => import("./plotly-chart").then((m) => m.Plot), {
  ssr: false,
  loading: () => (
    <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />
  ),
});

// Plotly needs color values, not classes: read the design tokens at runtime so
// the chart follows the theme (AC-4). The mark is --color-chart-1, checked with
// the dataviz validator against both surfaces.
type Colors = {
  readonly mark: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly font: string;
};

const readColors = (): Colors => {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    mark: token("--color-chart-1"),
    surface: token("--color-surface"),
    ink: token("--color-ink"),
    muted: token("--color-ink-muted"),
    line: token("--color-line"),
    font: getComputedStyle(document.body).fontFamily,
  };
};

const noColors: Colors = {
  mark: "",
  surface: "",
  ink: "",
  muted: "",
  line: "",
  font: "",
};

// The theme is set on <html data-theme>; re-read the tokens when it changes.
const subscribeToTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class"],
  });
  return () => observer.disconnect();
};

const themeKey = () =>
  document.documentElement.getAttribute("data-theme") ?? "";

function useColors(): Colors {
  const theme = useSyncExternalStore(subscribeToTheme, themeKey, () => null);
  return useMemo(() => (theme === null ? noColors : readColors()), [theme]);
}

type XYChartProps = {
  readonly x: Variable;
  readonly y: Variable;
  readonly points: readonly Point[];
};

// One series of dots: Y against X, one per trial at the saved values (AC-3),
// with a text alternative and the points as a table (AC-4).
function XYChart({ x, y, points }: XYChartProps) {
  const colors = useColors();
  const titleId = useId();
  const axis = (title: string) => ({
    title: { text: title, font: { color: colors.muted, size: 13 } },
    gridcolor: colors.line,
    linecolor: colors.line,
    zerolinecolor: colors.line,
    tickfont: { color: colors.muted, size: 12 },
    automargin: true,
  });
  const summary = `Gráfica de ${y.name} contra ${x.name}, ${points.length} ${points.length === 1 ? "ensayo" : "ensayos"}`;

  return (
    <figure className="flex flex-col gap-3">
      <div
        role="img"
        aria-labelledby={titleId}
        style={{ minHeight: CHART_HEIGHT }}
      >
        <p id={titleId} className="sr-only">
          {summary}
        </p>
        <div aria-hidden>
          <Plot
            data={[
              {
                type: "scatter",
                mode: "markers",
                x: points.map((p) => p.x),
                y: points.map((p) => p.y),
                text: points.map((p) => pointText(p, x, y)),
                hovertemplate: "%{text}<extra></extra>",
                marker: {
                  size: 10,
                  color: colors.mark,
                  line: { width: 2, color: colors.surface },
                },
              },
            ]}
            layout={{
              height: CHART_HEIGHT,
              autosize: true,
              margin: { t: 12, r: 12, b: 48, l: 56 },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { family: colors.font, color: colors.ink },
              xaxis: axis(variableLabel(x)),
              yaxis: axis(variableLabel(y)),
              hoverlabel: {
                bgcolor: colors.surface,
                bordercolor: colors.line,
                font: { color: colors.ink, family: colors.font },
              },
              showlegend: false,
            }}
            config={{
              displaylogo: false,
              responsive: true,
              modeBarButtonsToRemove: ["lasso2d", "select2d"],
            }}
            useResizeHandler
            className="w-full"
          />
        </div>
      </div>
      <details className="rounded-control border border-line px-3 py-2 text-sm">
        <summary className="cursor-pointer text-ink focus-ring">
          Ver puntos
        </summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th scope="col" className="py-1 font-medium">
                Ensayo
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {variableLabel(x)}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {variableLabel(y)}
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {pointsInXOrder(points).map((point) => (
              <tr key={point.trial} className="border-t border-line">
                <td className="py-1">{point.trial}</td>
                <td className="py-1 text-right">
                  {formatQuantity(point.x, null)}
                </td>
                <td className="py-1 text-right">
                  {formatQuantity(point.y, null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export { XYChart };
