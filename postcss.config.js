const supportedBrowsers = require(
  "next/dist/shared/lib/modern-browserslist-target"
);

module.exports = {
  plugins: [
    ["postcss-import", { skipDuplicates: false }],
    "next/dist/compiled/postcss-flexbugs-fixes",
    [
      "next/dist/compiled/postcss-preset-env",
      {
        browsers: supportedBrowsers,
        autoprefixer: {
          flexbox: "no-2009",
        },
        stage: 3,
        features: {
          "custom-properties": false,
        },
      },
    ],
  ],
};
