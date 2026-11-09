import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/** Public pages are crawlable; staff, account and BFF routes are not. Non-production deployments block everything. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.SITE_INDEXABLE !== "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/_bff/", "/en/staff", "/hi/staff", "/en/account", "/hi/account"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
