"use client";

import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

// The only module that imports Plotly. XYChart loads it with next/dynamic and
// ssr: false, so it reaches the browser on the results page only (AC-9).
const Plot = createPlotlyComponent(Plotly);

export { Plot };
