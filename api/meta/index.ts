import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chromium } from 'playwright'
import { redis } from '@/lib/redis'

import metascraper from 'metascraper'
import metascraperDescription from 'metascraper-description'
import metascraperImage from 'metascraper-image'
import metascraperLogo from 'metascraper-logo'
import metascraperTitle from 'metascraper-title'
import metascraperUrl from 'metascraper-url'

const scraper = metascraper([
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperTitle(),
  metascraperUrl()
])

const CACHE_TTL = 60 * 10

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url, refresh } = req.query

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' })
  }

  const cacheKey = `link-meta:${url}`

  if (!refresh) {
    const cached = await redis.get(cacheKey)
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        cached: true,
      })
    }
  } else {
    await redis.del(cacheKey)
  }

  try {
    const meta = await fetchMetadata(url)
    await redis.set(cacheKey, JSON.stringify(meta), 'EX', CACHE_TTL)

    return res.json({
      ...meta,
      cached: false,
      refreshed: Boolean(refresh),
    })
  } catch (err) {
    console.error('Scrape error:', err)
    return res.status(500).json({ error: 'Failed to fetch metadata' })
  }
}

async function fetchMetadata(targetUrl: string) {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    const html = await page.content()
    const finalUrl = page.url()

    let meta = await scraper({ html, url: finalUrl })
    meta = await enhanceMetadata(meta, page)

    return meta
  } finally {
    await browser.close()
  }
}

async function enhanceMetadata(meta: Record<string, any>, page: any) {
  meta.image = await getMeta(page, 'meta[property="og:image"]', 'content') || meta.image
  meta.title = await getMeta(page, 'meta[property="og:title"]', 'content') || await page.title()
  meta.description = await getMeta(page, 'meta[property="og:description"]', 'content') || await getMeta(page, 'meta[name="description"]', 'content') || meta.description
  return meta
}

async function getMeta(page: any, selector: string, attr: string) {
  return await page.locator(selector).getAttribute(attr)
}
