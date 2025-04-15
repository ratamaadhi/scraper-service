import { Hono } from "hono";
import { handle } from "hono/vercel";
import { serve } from "@hono/node-server";
import { chromium } from "playwright";
import { redis } from "@/lib/redis";

import metascraper from "metascraper";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo";
import metascraperTitle from "metascraper-title";
import metascraperUrl from "metascraper-url";

const scraper = metascraper([
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperTitle(),
  metascraperUrl(),
]);

const CACHE_TTL = 60 * 10; // 10 minutes

const app = new Hono();

app.get("/", (c) => {
  return c.text("Scraper service is running!");
});

async function fetchMetadata(targetUrl: string) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 15000 });

    const html = await page.content();
    const finalUrl = page.url();

    let meta = await scraper({ html, url: finalUrl });
    meta = await enhanceMetadata(meta, page);

    return meta;
  } finally {
    if (browser) await browser.close();
  }
}

async function enhanceMetadata(meta: Record<string, any>, page: any) {
  meta.image = await getImageMetadata(meta.image, page);
  meta.title = await getTitleMetadata(meta.title, page);
  meta.description = await getDescriptionMetadata(meta.description, page);
  return meta;
}

async function getImageMetadata(currentImage: string | null, page: any) {
  if (currentImage) return currentImage;
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  const fallbackImage = await page.locator("img").first().getAttribute("src");
  return ogImage || fallbackImage || null;
}

async function getTitleMetadata(currentTitle: string | null, page: any) {
  if (currentTitle) return currentTitle;
  const ogTitle = await page
    .locator('meta[property="og:title"]')
    .getAttribute("content");
  const pageTitle = await page.title();
  return ogTitle || pageTitle || null;
}

async function getDescriptionMetadata(
  currentDescription: string | null,
  page: any
) {
  if (currentDescription) return currentDescription;
  const ogDesc = await page
    .locator('meta[property="og:description"]')
    .getAttribute("content");
  const desc = await page
    .locator('meta[name="description"]')
    .getAttribute("content");
  return ogDesc || desc || null;
}

app.get("/meta", async (c) => {
  const url = c.req.query("url");
  const refresh = c.req.query("refresh");
  if (!url) return c.json({ error: "Missing url" }, 400);

  const cacheKey = `link-meta:${url}`;

  if (!refresh) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return c.json({
        ...JSON.parse(cached),
        cached: true,
      });
    }
  }

  if (refresh) {
    await redis.del(cacheKey);
  }

  try {
    const meta = await fetchMetadata(url);

    await redis.set(cacheKey, JSON.stringify(meta), "EX", CACHE_TTL);

    return c.json({
      ...meta,
      cached: false,
      refreshed: refresh,
    });
  } catch (err) {
    console.error("Scrape error:", err);
    return c.json({ error: "Failed to fetch metadata" }, { status: 500 });
  }
});

serve({
  fetch: app.fetch,
  port: 3001,
});

console.log("✅ Server running at http://localhost:3001");

export const GET = handle(app);
export default app;
