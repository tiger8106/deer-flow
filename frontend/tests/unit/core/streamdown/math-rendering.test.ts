import { expect, test } from "@rstest/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SafeStreamdown,
  SafeMessageResponse,
} from "@/core/streamdown/components";
import { streamdownPlugins } from "@/core/streamdown/plugins";

const formulas = [
  String.raw`\sigma_{max} = \sqrt[3]{\frac{6 F {E^*}^2}{\pi^3 R^2}}`,
  String.raw`\frac{1}{E^*} = \frac{1-\nu_1^2}{E_1} + \frac{1-\nu_2^2}{E_2}`,
];

for (const formula of formulas) {
  test(`renders a starred display equation without Markdown completion: ${formula}`, () => {
    const html = renderToStaticMarkup(
      createElement(
        SafeStreamdown,
        streamdownPlugins,
        `$$\n${formula}\n$$\n\n其中：$E^*$ 是等效弹性模量。`,
      ),
    );
    expect(html).not.toContain("katex-error");
    expect(html).toContain("katex-display");
    expect(html).not.toContain("$$*");
    expect(html).not.toContain("。*");
  });
}

test("ordinary streaming emphasis still completes without math", () => {
  const html = renderToStaticMarkup(
    createElement(SafeStreamdown, {}, "**正在分析"),
  );
  expect(html).toContain('data-streamdown="strong"');
});

test("chat replies preserve inline superscripts, subscripts, tagged equations and citations", () => {
  const html = renderToStaticMarkup(
    createElement(
      SafeMessageResponse,
      {
        ...streamdownPlugins,
        parseIncompleteMarkdown: true,
      },
      String.raw`等效模量 $E^*$，应力 $\sigma_{max}$。

\[ E^* = \frac{1}{x_1} \tag{3-1} \]

[原文](https://example.test/source)

**已完成**`,
    ),
  );
  expect(html).not.toContain("katex-error");
  expect(html).toContain("katex-display");
  expect(html).toContain('href="https://example.test/source"');
  expect(html).toContain('data-streamdown="strong"');
});
