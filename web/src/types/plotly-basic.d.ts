// The basic Plotly bundle (scatter, bar, pie) ships no types; it has the full
// bundle's API for the traces it includes (spec 0009).
declare module "plotly.js-basic-dist-min" {
  import Plotly from "plotly.js";
  // The package's real shape is a default export (it is a UMD bundle).
  // eslint-disable-next-line import/no-default-export
  export default Plotly;
}
