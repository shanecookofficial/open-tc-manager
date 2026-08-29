import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders a GFM table", () => {
    const source = `| Col A | Col B |
| --- | --- |
| one | two |`;

    const { container } = render(<Markdown>{source}</Markdown>);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Col A")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(container.querySelector("th")).toBeTruthy();
    expect(container.querySelector("td")).toBeTruthy();
  });

  it("does not render script elements from hostile payloads", () => {
    const source = `# Title\n\n<script>alert('xss')</script>\n\nSafe text`;

    const { container } = render(<Markdown>{source}</Markdown>);

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Safe text")).toBeInTheDocument();
  });

  it("strips img onerror attributes", () => {
    const source = `![alt](https://example.com/x.png "<img onerror=alert(1)>")`;

    const { container } = render(<Markdown>{source}</Markdown>);

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("onerror")).toBeNull();
  });

  it("does not honor javascript: hrefs", () => {
    const source = `[click me](javascript:alert(1))`;

    const { container } = render(<Markdown>{source}</Markdown>);

    expect(container.querySelector("a[href^='javascript:']")).toBeNull();
    expect(container.querySelector("a[href*='alert']")).toBeNull();
  });

  it("strips raw HTML img onerror payloads", () => {
    const source = `<img src="x" onerror="alert(1)">`;

    const { container } = render(<Markdown>{source}</Markdown>);

    expect(container.querySelector("img[onerror]")).toBeNull();
    const img = container.querySelector("img");
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull();
    }
  });
});
