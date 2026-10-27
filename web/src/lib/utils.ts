import { createCn } from "cn/config";

// The custom size, radius and shadow tokens from globals.css, so merging
// `text-readout` with `text-ink` keeps both instead of dropping the size.
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "display-lg",
            "title",
            "readout",
            "readout-lg",
            "cell",
            "label",
          ],
        },
      ],
      rounded: [{ rounded: ["card", "control"] }],
      shadow: [{ shadow: ["card", "dock"] }],
    },
  },
});
